/* tslint:disable:no-console */
import { Rating } from 'ts-trueskill';
import * as fs from 'fs';
import * as crypto from 'crypto';

const DB_FNAME = './sides.json';
const SIDES_DNAME = './sides';
function sha(s: string): Hash {
  const hash = crypto.createHash('sha256');
  hash.update(s);
  return hash.digest('hex');
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

let side_files = fs.readdirSync(SIDES_DNAME)

console.log("Checking for side updates or removals");


console.log("Checking for new sides");
let side: fs.Dirent
// tslint:disable-next-line:no-conditional-assignment ya ya, I know what I'm doing.
while ((side = sides.readSync()) !== null) {
  if (db.has(side.name)) continue
  let hash: Hash
  try {
    hash = sha(fs.readFileSync(SIDES_DNAME + '/' + side.name, 'ascii'));
  } catch (e) {
    console.log(`error: while reading file "${side.name}" in an attempt to hash it`, e);
    process.exit(1);
  }

  db.push({ rating: new Rating(), name: side.name, hash })
}
fs.writeFileSync(DB_FNAME, JSON.stringify(db))

console.log("Writing Database");


console.log("Running Tournament");
console.log("Picking highest variance side");
console.log("Finding competitors for a 16 match game");
console.log("Running tournament!");
console.log("Updating rankings and writing");
