/* tslint:disable:no-console */
import { Rating, TrueSkill, quality_1vs1, rate} from 'ts-trueskill';
import * as fs from 'fs';
import * as crypto from 'crypto';
import * as cheerio from 'cheerio';
import ts = require('typescript');
import { spawnSync } from 'child_process';

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
TS_ENV.mu=TS_INIT_MU; // Starting rank, I think this is just an arbitrary value
TS_ENV.sigma=TS_INIT_SIGMA; // Starting deviation, This is more signifigant,
// by default it's 1/3rd because of how trueskill is typically displayed to the masses
// which is by taking a "conservative estimate" (mu - 3*sigma)
// I don't care about your feelings so I just show you mu.
TS_ENV.beta=8; // beta has an interesting effect on the ratings and how fast certanty changes
// as an example: I was running a trial of the tournaments and had beta set to 5. In the
// preliminary games gnats-8 got crazy lucky and landed a clean sweep victory against its
// opponents. That was pretty unlucky but obviously not impossible. trueskill interpreted
// this victory as a MASSIVE WIN and put gnats-8 as the highest rank bot in the rankings
// and signifigantly decreased its variance.

// it then proceeded to match gnats-8 up repeatedly against isi, convinced gnats-8 was
// actually amazing. Hilarious. But not what I'm looking for in a ranking system.

function sha(s: string): Hash {
  const hash = crypto.createHash('sha256');
  hash.update(s);
  return hash.digest('hex');
}

function hashSide(side: string): Hash{
  return sha(fs.readFileSync(SIDES_DNAME + '/' + side, 'ascii'));
}

type Hash = string
interface Record {
  rating: [number, number] // this is [mu, sigma]
  hash: Hash
}
interface Database{
  [side: string]: Record
}
let db: Database

// The procedure to run the tournament is as follows
// - Initial Setup
  // - load the existing database, otherwise set it to [] if it does not exist
  // - check each record in the databse and verify the side.gb file exists
  //   - remove sides that no longer exist and warn
  // - check that the side.gb file's hash matches that in the database
  //   - reset score and variance of that side if it does not match, then update
  // - scan sides for new a new side file that isn't present in db
  // - write the updated records back to the database
// - Tournament
  // - select a random side that has the highest varience
  // - calculate the match co-efficient for every side in the database and select the top 15
  // - run the tournament
  // - update rankings and write to the database

console.log("Initial Database Load");
try {
  db = JSON.parse(fs.readFileSync(DB_FNAME, 'ascii'));
} catch (e) {
  console.log("warn: database failed to load, making new one");
  db = {};
}
let sides: fs.Dir
try {
  sides = fs.opendirSync(SIDES_DNAME);
} catch (e) {
  console.log(`error: where is the ${SIDES_DNAME} folder full of sides?`, e)
  process.exit(1);
}

const sideFiles = fs.readdirSync(SIDES_DNAME)

console.log("Checking for side updates or removals");
const dbRemove = Object.keys(db).filter(side => {
  let hash: Hash
  try{
    hash = hashSide(side);
  }catch(e){
    console.log(`failed to load "${side}", removing from list`)
    return true;
  }
  if(db[side].hash !== hash){
    console.log(`"${side} has been updated! resetting score`);
    db[side] = { rating: [TS_INIT_MU, TS_INIT_SIGMA], hash };
  }
  return false;
});
dbRemove.forEach(gone => delete db[gone]);

console.log("Checking for new sides");
sideFiles.filter(s=>!(s in db)).forEach(side => {
  console.log(`New side!: "${side}"`)
  let hash: Hash
  try {
    hash = hashSide(side);
  } catch (e) {
    console.log(`error: while reading file "${side}" in an attempt to hash it`, e);
    process.exit(1);
  }
  db[side] = { rating: [TS_INIT_MU, TS_INIT_SIGMA], hash };
});

console.log("Writing Database");
fs.writeFileSync(DB_FNAME, JSON.stringify(db, null, '\t'))

console.log("Running Tournament");
while(true){
  console.log("Picking highest variance side");
  const [runSide, _ ] = Object.keys(db)
    .reduce((highestSide,side) => {
      return highestSide[1] >= db[side].rating[1] ?
        highestSide : [side,db[side].rating[1]]
  }, ['nosides?!.wtf', -999]);
  console.log(`"${runSide}" has the highest variance. Matching`);

  // Trueskill unexpectedly considers sides with low variance a better match than sides with high variance
  // if you are looking for a high variance side. So I'm multiplying the match quality by the mu.
  // I'll get a smoother ranking faster by prioratizing the unknowns.
  console.log("Finding competitors for a 16 side tourny");
  const matches: [number, string][] = [];
  Object.keys(db).map(side=>{
    matches.push([
      quality_1vs1(new Rating(db[runSide].rating), new Rating(db[side].rating), TS_ENV) * db[side].rating[1],
      side]);
  })
  matches.sort((a,b)=>b[0]-a[0]);
  // console.log(matches)

  // take the top 15 sides and return them. note that often runSide shows up in this list
  // so we take 16 sides and remove them if they show up...
  // But if they don't show up, then we just pop the last one off
  const contestants = matches.slice(0, 16).map(m=>m[1]).filter(m=>m!==runSide);
  if(contestants.length === 16) contestants.pop();
  contestants.push(runSide);

  // console.log(contestants);
  console.log("Running tournament!");

  spawnSync('grobots', ['-t10', '-b0', '-H', contestants.map(c=>SIDES_DNAME+'/'+c)].flat());
  console.log("Tournament done!");
  const $ = cheerio.load(fs.readFileSync('./tournament-scores.html', 'ascii'));

  // Delete old tournament file, because these can get big if we just let them grow
  fs.unlinkSync('./tournament-scores.html')

  const results = $('table:last-of-type tr').map((i, e) =>({
    side: $(e).find('td:nth-of-type(2) a').attr('href')?.match(/\/([^/]+)$/)[1], // trim out garbage paths
    // I round to the 1/20th because draws are significant in trueskill. And 14% and 16% isn't that different
    score: Math.round((100 - parseFloat($(e).find('td:nth-of-type(4)').text())) / 5)
  })).get().filter(r=>r.side !== undefined);
  console.log(results);

  console.log("Updating rankings and writing");
  const adjusted: Rating[] = (TS_ENV.rate(
    results.map(r=>[new Rating(db[r.side].rating)]),
    results.map(r=>r.score),
    undefined, undefined).flat() as Rating[])
  results.forEach((r, i)=>db[r.side].rating=[adjusted[i].mu, adjusted[i].sigma])

  fs.writeFileSync(DB_FNAME, JSON.stringify(db, null, '\t'))
}
