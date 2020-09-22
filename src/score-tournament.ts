/* tslint:disable:no-console */
import * as fs from 'fs';
import { quality_1vs1, Rating, TrueSkill } from 'ts-trueskill';
import { SideDatabase, Side, MuSigma } from './side-database';
import * as cheerio from 'cheerio';
import { spawn, spawnSync } from 'child_process';

// This script will run a ratings tournament using the trueskill ratings system.
// It repeatedly selects the highest variance side, and creates matches for them.
// This has a special advantage. When new sides are introduced or updated, score-tournament
// reset their rating and variance. Since their variance will highest, it will
// quickly figure out the new sides ranking amongst the set it already knows.

const DB_FNAME = './sides.json';
const SIDES_DNAME = './sides';

const TS_ENV = new TrueSkill();

const TS_INIT_MU = 25;
TS_ENV.mu = TS_INIT_MU; // Starting rank, I think this is just an arbitrary value

const TS_INIT_SIGMA = TS_INIT_MU / 3;
TS_ENV.sigma = TS_INIT_SIGMA; // Starting deviation. How uncertan the system is of its rank
// by default it's 1/3rd because of how trueskill is typically displayed to others
// which is by taking a "conservative estimate" (mu - 3*sigma)

TS_ENV.beta = 9; // beta essentially says "If side A has x points, and side B has x+beta points
// then side B has a 76% chance to win."

// beta has an interesting effect on the ratings and how fast certanty changes
// as an example: I was running a trial of the tournaments and had beta set to 5. In the
// preliminary games gnats-8 got crazy lucky and landed a clean sweep victory against its
// opponents. gnats-8 is... not good. But it's not impossible for a tournament like that to happen.
// and Trueskill interpreted this victory as a MASSIVE WIN. It put gnats-8 as the highest rank bot
// and signifigantly decreased its variance. It seemed sure.

// It then proceeded to match poor gnats-8 up repeatedly against isi, convinced gnats-8 was
// actually amazing. Every time gnats-8 got oblitereated truekill would move it down a bit, then
// reduce its variance because "it knew more about gnats now". Hilarious. But not helpful.

TS_ENV.tau = 0.00; // Tau is a fudge factor that compensates for a players change in ability over time.
// sides do not get better with practice.

TS_ENV.drawProbability = 0.04; // Specifies the percentage chance of a draw occuring
// drawProbability has an effect on trueskill that I do not fully understand, it seems to create larger
// changes in skill for a given variance, and slow down its increase in certanty. And possible how
// significant it thinks a draw is should one occur. I know trueskill thinks of draws as important
// datapoints. In this system I round score rates after tournaments down to the nearest 5% and consider
// sides that are within those brackets as having drawed. I think it helps convergance but IDK it's
// hard to test.

// The procedure to run the tournament is as follows
// - Initial Setup
//   - load the existing database, otherwise set it to [] if it does not exist
//   - check each record in the databse and verify the side.gb file exists
//     - remove sides that no longer exist and warn
//   - check that the side.gb file's hash matches that in the database
//     - reset score and variance of that side if it does not match, then update
//   - scan sides for new a new side file that isn't present in db
//   - write the updated records back to the database
// - Tournament
//   - select a random side that has the highest varience
//   - calculate the match co-efficient for every side in the database and select the top 15
//   - run the tournament
//   - update rankings and write to the database

console.log("Initial Database Load");
let db: SideDatabase;
db = SideDatabase.loadFrom('./sides.json');
db.checkAgainst('./sides', [TS_INIT_MU, TS_INIT_SIGMA]);
db.writeTo('./sides.json');

function tsSplit(a: MuSigma, b: MuSigma): number {
	const quality = quality_1vs1(new Rating(a), new Rating(b), TS_ENV) * (0.9 + Math.random()*0.2)
	// we also vary match quality by 20% so a wider ranger of contestants is sampled.
	// we don't want to judge a side just by how they do in their same cohort. spread it out a bit.
	const enemyVar = b[1]; // we modify quality so that higher variance is prioratized.
	return quality + (quality * enemyVar) / 5;
}

(async () => {
	while (true) {
		const results = await Promise.all(
			new Array(8).fill(1).map(async i => {
				const runSide = db.highestSigma();
				console.log(`"${runSide}" has the highest variance. Matching`);
				const matchDb = db.splitMatches(runSide, 16, tsSplit);
				const matchLocation = await generateMatch(matchDb);
				await runMatch(matchLocation, matchDb);
				fs.rmdirSync(matchLocation, { recursive: true });
				return matchDb;
			}));

		results.forEach(r => db.merge(r));
		db.writeTo('./sides.json');
	}
})();

async function generateMatch(match: SideDatabase): Promise<string> {
	const dirs = Object.fromEntries(fs.readdirSync('./').map(d => [d, 1]));

	let i = 0; let newdir: string;
	do {
		i++;
		newdir = `score-${i}`
	} while (newdir in dirs);

	fs.mkdirSync(newdir);
	await Promise.all(match.rks().map(side =>
		fs.promises.copyFile('./sides/' + side, newdir + '/' + side)));

	return newdir;
}

async function runMatch(matchLocation: string, mDb: SideDatabase) {
	const child = spawn('grobots', ['-t10', '-b0', '-H', mDb.rks()].flat(), { cwd: matchLocation });
	await new Promise(r => {
		child.on('exit', r);
	});
	const $ = cheerio.load(fs.readFileSync('./' + matchLocation + '/tournament-scores.html', 'ascii'));

	// Delete old tournament file, because these can get big if we just let them grow
	// fs.unlinkSync('./tournament-scores.html')

	interface Result { side: Side, score: number }
	const results: Result[] = $('table:last-of-type tr').map((i, e) => ({
		side: $(e).find('td:nth-of-type(2) a').attr('href')?.match(/\/([^/]+)$/)[1], // trim out garbage paths
		// I round to the nearest 5% because draws are significant in trueskill. +-2.5% isn't that big anyway.
		score: Math.round((100 - parseFloat($(e).find('td:nth-of-type(4)').text())) / 5)
	})).get().filter(r => r.side !== undefined);
	// console.log(results);

	console.log("Updating rankings");
	const adjusted: Rating[] = (TS_ENV.rate(
		results.map(r => [new Rating(mDb.records[r.side].rating)]),
		results.map(r => r.score),
		undefined, undefined).flat() as Rating[])
	// console.log(adjusted.map(r=>r.toString()));

	results.forEach((r, i) => mDb.records[r.side].rating = [adjusted[i].mu, adjusted[i].sigma])
}
