/* tslint:disable:no-console */
import { Rating, TrueSkill, quality_1vs1, rate } from 'ts-trueskill';
import * as fs from 'fs';
import * as crypto from 'crypto';
import * as cheerio from 'cheerio';

type Side = string; // generally represented by a file name
type Hash = string;
type TournamentFolderName = string;

function sha(text: string): Hash {
  const hash = crypto.createHash('sha256');
  hash.update(text);
  return hash.digest('hex');
}

function hashFile(file: string): Hash {
  return sha(fs.readFileSync(file, 'ascii'));
}

export type Mu = number;
export type Sigma = number;
export type MuSigma = [Mu, Sigma];
export interface Record {
  rating: MuSigma,
  hash: Hash,
};
export interface Records {
  [side: string]: Record
};

export class SideDatabase {
  records: Records = {};

  static loadFrom(sideFile: string): SideDatabase {
    const db = new SideDatabase();

    try {
      db.records = JSON.parse(fs.readFileSync(sideFile, 'ascii'));
    } catch (e) {
      console.log("warn: database failed to load, making new one");
      db.records = {};
    }

    return db;
  }

  checkAgainst(sidesDirectory: string, newSideRating: MuSigma) {
    const sideFiles = fs.readdirSync(sidesDirectory);

    console.log("Checking for side updates or removals");
    const dbRemove = Object.keys(this.records).filter(side => {
      let hash: Hash
      try {
        hash = hashFile(sidesDirectory + '/' + side);
      } catch (e) {
        console.log(`failed to load "${side}", removing from list`)
        return true;
      }
      if (this.records[side].hash !== hash) {
        console.log(`"${side} has been updated! resetting score`);
        this.records[side] = { rating: newSideRating, hash };
      }
      return false;
    });

    dbRemove.forEach(gone => delete this.records[gone]);

    console.log("Checking for new sides");
    sideFiles
      .filter(s => !(s in this.records))
      .forEach(side => {
        console.log(`New side!: "${side}"`)
        let hash: Hash
        try {
          hash = hashFile(side);
        } catch (e) {
          console.log(`error: while reading file "${side}" in an attempt to hash it`, e);
          process.exit(1);
        }
        this.records[side] = { rating: newSideRating, hash };
      });
  }

  writeTo(dbFile: string) {
    console.log("Writing Database to " + dbFile);
    fs.writeFileSync(dbFile, JSON.stringify(this.records));
    // TODO, alter format so that it's one side per line.
  }

  /** Give this function something that compares two MuSigma's with some kind of value, and it will
   * select the top $size matches for that. match.a will be the MuSigma of target. match will loop
   * through all sides
   *
   * note that the target Side is guarenteed to be included in the split database, even if the
   * match function considers that side a low quality match agianst itself (yah. thanks trueskill)
   */
  splitMatches(target: Side, size: number, match: (a: MuSigma, b: MuSigma) => number): SideDatabase {
    const matches: [number, Side][] = [];
    Object.keys(this.records).forEach(side => {
      const quality = match(this.records[target].rating, this.records[target].rating);
      matches.push([quality, side]);
    });
    matches.sort((a, b) => b[0] - a[0]);
    // console.log(matches)

    // take the top $size sides and return them. note it's possible that target itself may not show up
    // in this list (crazy right? sometimes trueskill thinks someone else is a better match
    // for you than YOU are!) so we take 16 sides and remove them if they show up...
    // But if they don't show up, then we just pop the last one off
    const contestants: Side[] = matches.slice(0, size).map(m => m[1]).filter(m => m !== target);
    if (contestants.length === size) contestants.pop();
    contestants.push(target);
    // console.log(contestants);

    const newDb = new SideDatabase();
    contestants.forEach(s => {
      newDb.records[s] = this.records[s];
      delete this.records[s];
    })
    return newDb;
  }

  highestSigma(): Side {
    const [runSide, _] = Object.keys(this.records)
    .reduce((highestSide, side) => {
      return highestSide[1] >= this.records[side].rating[1] ?
        highestSide : [side, this.records[side].rating[1]];
    }, ['nosides?!.wtf', -999]);
    return runSide;
  }

  /** merge databases */
  mergeDatabase(other: SideDatabase) {
    Object.keys(other.records)
      .forEach(s => this.records[s] = other.records[s]);
  }

  generateTournament(tDb: SideDatabase): TournamentFolderName {
    return "";
  }
}
