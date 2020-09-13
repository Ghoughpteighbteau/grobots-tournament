#side OE Roaches 2
#author oehpr
; fparam eng 0.05 0.3
; fparam solar 0.001 0.05
; fparam const 0.7 2.0
; fparam eater 1.0 2.0
; iparam batt 200 400
; iparam e-start 5 40
; iparam fsens 6 12
; iparam proc 5 20
; iparam armor 40 130
; iparam con-gap 30 150
; iparam escapet 2 5

Non combat Gatherer.
Scampers when damaged.
Uses food nudging.

#color 963
#type Roach
#hardware
	engine %%eng%%
	solar-cells %%solar
	constructor %const%%
	eater %%eater%%
	energy %%batt%% %%e-start%%
	food-sensor %%fsens%%
	processor %%proc%%
	armor %%armor%%

#code
con-logic:
	1 constructor-type!
	energy max-energy - %%con-gap%% +
	energy constructor-remaining - 15 - ; if I can get this baby done, I should do it.
	max constructor-rate!
	return

wait-sync:
	con-logic^
	do
		sync sync sync sync sync
	1 - dup while-loop drop
	return

scatter:
	;random displacement large enough to avoid food on sensor
	10 random-angle polar-to-rect
	engine-velocity!
	engine-max-power 3 / engine-power!
	15 wait-sync^
	return

#var escape-time
escape: ; AHHHHHHHH!!!!!!
	engine-max-power engine-power! ; ALL GAS NO BRAKES!!!
	%%escapet%% escape-time!
	random-angle
	do
		dup ; RUNNNNNN!!!
		10 swap polar-to-rect engine-velocity!
		3 wait-sync^
		dup ; JIIIIIIINK!!!
		0.5 random-bool pi * pi/2 -
		+
		10 swap polar-to-rect engine-velocity!
		2 wait-sync^
		escape-time 1 - escape-time!
	escape-time while-loop
	return

#start
#var last-armor
max-armor last-armor!
#var build-cost
1 constructor-type!
constructor-remaining build-cost!

scatter^
do
	con-logic^

	friendly-collision 0 > scatter& ifc

	last-armor armor - 1 > escape& ifc
	armor last-armor!

	random-angle robot-sensor-focus-direction!
	44 periodic-food-sensor drop
	food-found if
		position food-position v- ; distance from food
		velocity 6 vs* v+        ; velocity compensation
		7 vs/                    ; power compensation
		2dup norm engine-power!
		vnegate engine-velocity!
	else
		energy 20 > if
			scatter^
		else
			0 engine-power!
			23 wait-sync^
		then
	then
forever
#end
