#!/bin/bash -x

# This script subdivides all the sides into $RANKS, by default that is
# 7 buckets. It places them randomly at first and runs $RANKS
# individual tournaments. The rating of each side in the initial
# tournaments places them in their respective buckets.
#
# eg. in rank 1, the number 1 rated side goes to rank 7, the number 15
# rated side goes to rank 3, and the number 30 rated side goes to rank 1
#
# These initial tournaments tell you little about the lower ranked
# sides, as they simply get annihilated by rank 7's, additionally a
# bunch of high ranking bots may end up together, so subsequent
# advancment tournaments are run where sides compete with other sides
# more their strength. The top rated bots in these advancment
# tournaments rank up, bottom rated bots rank down. Enough of these
# are run that a rank 7 bot that ended up in rank 1 (this will NEVER
# happen) can make it up to rank 7
#
# Usually 2 or 3 of these advancment tournaments is enough to clean up
# the exceptions, and the buckets themselves will be pretty darn good
# sample of bots to compete against.
#
# Rank 1's and Rank 2's are particularily fun to watch. Like looking
# at an ecosystem where kiwi's are considered apex predators. Ranks 5
# and 6 feel like hard handed competition, You see interesting fights
# and diverse strategies
#
# Rank 7 is depressing to look at.
#
# Oh and you can just change the number of buckets here if you want more or less:
RANKS=7

# NOTE: This script is dependent on a tool called "pup"
# https://github.com/ericchiang/pup
# to extract tournament results.

run_tourn(){
	for n in $( seq 1 $RANKS ); do
		( cd r$n
			grobots -t100 -b0 -H ./* &>/dev/null
		)&
	done
	wait
}

init(){
	# place initial buckets
	for n in $(seq 1 $RANKS); do
		rm -rf r$n &>/dev/null
		mkdir -p r$n
	done

	cp -f ./sides/* r1/

	( cd r1
		SIDE_N="$(find . -mindepth 1 | wc -l)"
		RANK_N=$(( SIDE_N / RANKS ))
		for n in $(seq 2 $RANKS); do
			mv $(find . -mindepth 1 | sort -R | head -n$RANK_N) ../r$n
		done
	)

	run_tourn
}

distribute(){
	# folder for subsequent ranks
	for n in $(seq 1 $RANKS); do
		rm -rf s$n &>/dev/null
		mkdir -p s$n
	done

	local ranker_n
	for n in $(seq 1 $RANKS); do
		( cd r$n
			cat tournament-scores.html | pup 'html body table:last-of-type tbody tr td a attr{href}' | cut -f3 -d/  >/tmp/rankers
			ranker_n="$(cat /tmp/rankers | wc -l)"

			cp ./tournament-scores.html ../s$n

			for i in $(seq 1 $ranker_n); do
				cp $(cat /tmp/rankers | head -n$i | tail -n1) ../s$(( (ranker_n - i) * RANKS / ranker_n + 1 ))/
			done
		)
	done

	for n in $(seq 1 $RANKS); do
		rm r$n -r
		mv s$n r$n
	done

	run_tourn
}

advance(){
	local rankers
	local dist="$1" # number of bots shifting ranks, up and down

	# folder for subsequent ranks
	for n in $(seq 1 $RANKS); do
		rm -rf s$n &>/dev/null
		mkdir -p s$n
	done

	for n in $(seq 1 $RANKS); do
		( cd r$n
			rankers="$(cat tournament-scores.html | pup 'html body table:last-of-type tbody tr td a attr{href}' | cut -f3 -d/ )"
			ranker_n="$(echo "$rankers" | wc -l)"
			cp ./tournament-scores.html ../s$n

			if [[ -e ../s$(( n + 1 )) ]]; then
				mv $(echo "$rankers" | head -n"$dist") ../s$(( n + 1 ))/
			fi
			if [[ -e ../s$(( n - 1 )) ]]; then
				mv $(echo "$rankers" | tail -n"$dist") ../s$(( n - 1 ))/
			fi
			mv * ../s$n/
		)
	done

	for n in $(seq 1 $RANKS); do
		rm r$n -r
		mv s$n r$n
	done

	run_tourn
}

init
distribute
advance 10
advance 10
advance 10
advance 7
advance 5
advance 3
advance 2
advance 1
