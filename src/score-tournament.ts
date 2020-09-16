/* tslint:disable:no-console */
import * as fs from 'fs';
import { quality_1vs1, Rating, TrueSkill } from 'ts-trueskill';
import { SideDatabase, Side, MuSigma } from './side-database';
import * as cheerio from 'cheerio';
import { spawn, spawnSync } from 'child_process';

// This script will run a ratings tournament using trueskill ratings.
// the advantage of this is that when new sides are introduced, or updated
// this script will select the highest variance (unknown) sides for matches
// which means it will figure out as fast as it theoretically can how
// all the new entrants are, matching them with what it believes are
// their 15 best matches.

const DB_FNAME = './sides.json';
const SIDES_DNAME = './sides';
const TS_INIT_MU = 25;
const TS_INIT_SIGMA = TS_INIT_MU / 3; // there's a bug in trueskill's code, can't assign sigma or beta, well w/e
// TODO: adjust tau :\
const TS_ENV = new TrueSkill();
TS_ENV.mu = TS_INIT_MU; // Starting rank, I think this is just an arbitrary value
TS_ENV.sigma = TS_INIT_SIGMA; // Starting deviation, This is more signifigant,
// by default it's 1/3rd because of how trueskill is typically displayed to the masses
// which is by taking a "conservative estimate" (mu - 3*sigma)
// I don't care about your feelings so I just show you mu.
TS_ENV.beta = 8; // beta has an interesting effect on the ratings and how fast certanty changes
// as an example: I was running a trial of the tournaments and had beta set to 5. In the
// preliminary games gnats-8 got crazy lucky and landed a clean sweep victory against its
// opponents. That was pretty unlucky but obviously not impossible. Trueskill interpreted
// this victory as a MASSIVE WIN and put gnats-8 as the highest rank bot in the rankings
// and signifigantly decreased its variance.

// It then proceeded to match poor gnats-8 up repeatedly against isi, convinced gnats-8 was
// actually amazing. Every time gnats-8 got oblitereated truekill would move it down a bit, then
// reduce its variance because "it knew more about gnats now". Hilarious. But not what I'm
// looking for in a ranking system.

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
	const quality = quality_1vs1(new Rating(a), new Rating(b), TS_ENV)
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
