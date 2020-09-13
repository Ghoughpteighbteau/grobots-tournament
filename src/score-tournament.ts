/* tslint:disable:no-console */
import { Rating } from 'ts-trueskill';
import * as fs from 'fs';
import * as crypto from 'crypto';

// This script will run a ratings tournament using trueskill ratings.
// the advantage of this is that when new sides are introduced, or updated
// this script will select the highest variance (unknown) sides for matches
// which means it will figure out as fast as it theoretically can how
// all the new entrants are, matching them with what it believes are
// their 15 best matches. This will very quickly figure out its rank.

const DB_FNAME = './sides.json';
const SIDES_DNAME = './sides';
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
  rating: Rating
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
  console.log(`error: where is the ${SIDES_DNAME}folder full of sides?`, e)
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
    db[side] = { rating: new Rating(), hash };
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

  db[side] = { rating: new Rating(), hash }
});

console.log("Writing Database");
fs.writeFileSync(DB_FNAME, JSON.stringify(db, null, '\t'))

console.log("Running Tournament");
console.log("Picking highest variance side");
const [runSide, _ ] = Object.keys(db)
  .reduce((highestSide,side) => {
    return highestSide[1] > db[side].rating.pi ?
      highestSide : [side,db[side].rating.pi]
}, ['nosides?!.wtf', -999]);
console.log(`"${runSide}" has the highest variance. Matching`);
console.log("Finding competitors for a 16 side tourny");

// console.log("Running tournament!");
// console.log("Updating rankings and writing");
