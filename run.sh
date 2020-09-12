#!/bin/bash -x
RANKS=7
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
