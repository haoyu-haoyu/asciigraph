# What moves, and how

The checks in SKILL.md say whether a loop is seamless and visible. This file is for the harder question: does it move like the real thing? Use it in two places:

- **Before rendering:** go through the photo and name each part: what it is, whether it should move, and how. Say it to the user in a line or two ("the sea rolls in toward the cliff, the grass on top sways, the rock and the cliff stay still, the clouds drift slowly"). That is what you will judge the result against.
- **After rendering:** watch the `flow` version at real speed for a whole loop, then the `ascii` one. Compare each part with the table below, not with the previous render. People compare it with real footage in their head, so picture what a real video of that place looks like.

When something is off, find its row below, try the fix, and re-check stills before exporting again.

**Marks are the fix for anything in the wrong region.** When a part should be still and moves, or should move and doesn't, paint it instead of turning knobs: red to keep still, green to let it move (parameters.md, Marks). Settings change how things move; marks change what moves. When the fix column says it's a limit, don't keep turning knobs: tell the user what's wrong and why.

## The one rule

Each part moves the way it does in the real world, at its own pace, and nothing drags anything else along. A wave doesn't move the cliff it hits. Clouds don't move with the sea. Grass sways, the hill it grows on doesn't.

## Still things

| Part | Should | Looks wrong when | Fix |
|---|---|---|---|
| Cliffs, rocks, sand, buildings, roads | stay completely still | they wobble or swim with the water | open `shore=show`. If the red misses them, they were read as water. Over a sky, open `sky=show`; if blue covers them, use `sky=off`. If neither helps (wet dark rock at the waterline is the usual case), paint it red |
| A mountain or hill with grass on it | the land stays put; only the grass on it sways | the whole hill breathes or slides | as above. The sway should stay within a few pixels; if the whole slope moves, paint the slope red (its grass then stops swaying too) |
| Piers, boats, masts, poles | stay still | they bend with the waves | too thin for the mask to find (160 cells across): paint them red with a small brush, or crop them out with `focus` |

## Water

| Part | Should | Looks wrong when | Fix |
|---|---|---|---|
| Open sea seen from the shore | waves come from the horizon toward the land, in perspective: small and slow far off, bigger and faster up close | the far sea moves as fast as the near sea, like a wall; or waves run sideways or out to sea | needs a sea horizon. Check `sky=show`: blue should come right down to a straight horizon. If waves run the wrong way, set `wind` to the direction they should travel (0 = right, 90 = up) |
| The photo's own waves | keep going the way they already run in the photo; the motion continues them rather than adding a second set | new ripples cross the photo's crests at an angle | set `wind` along the photo's wave direction. If the waves look the wrong size, set `wavelength` (in frame heights, roughly 0.1–0.55: 0.1 is short chop, 0.3 long swell; the page's info line shows the current one as `waves 0.23h`) |
| Waves reaching rock or sand | break: white water is thrown up, then slowly runs back. In rhythm, not all at once | the water looks sucked into the shore, or a flat white band sits along the coast | that's the surge in `src/water.js`; no URL option changes it. Report it as a bug with a still |
| Surf on a beach, seen from above | foam runs up the sand and slides back; the lace churns in place | foam slides sideways like a conveyor belt | lower `drift` (0.2) and raise `churn` (1.5) |
| River, stream, tidal channel | flows one way along its banks | it churns in place like surf | raise `drift` (0.8), lower `churn` (0.6); set `wind` to the flow direction |
| Calm lake, still reflections | barely moves; reflections shiver a little | the reflection of a tree or hill slides | lower `amp` (0.5). If the reflection is read as land and freezes while the water around it moves, that is the better mistake; leave it |
| Shallow clear water over sand | ripples drift; the sand under it stays put | the sea floor swims | lower `amp`. If it's dry sand beside the water that swims, paint it red |
| Any water | moves smoothly | sparkle flickers hard, or fine detail far off shimmers | lower `amp` (0.7). If the far sea still flickers, it's a limit: say so |

## Waterfalls and steam

Ask for these with `scene=waterfall` or `scene=steam`; auto never picks them. Check `shore=show` first: only the falling water or the plume should be untinted.

| Part | Should | Looks wrong when | Fix |
|---|---|---|---|
| Falling water | runs down its own streaks, fast; each streak at a slightly different pace | it slides down as one sheet, or the rock behind it moves | `speed` (0.7 calmer, 1.4 a torrent). If rock moves, it was read as water: paint it red |
| The lip of the fall | the rock it pours over stays put; the water starts there | rock is dragged down into the water | report it with a still: the copies should read the still photo there |
| Mist at the foot | billows out from where the water lands | it stops in mid-air, or the cliff beside it drifts | paint what should move green, what shouldn't red |
| Pool or river below the fall | drifts away from the foot, rings of ripples spreading out from it; rocks in it stay put | it lies still, or a pale rock drifts with it | `shore=show`: the pool should be untinted, its rocks red. Paint missed water green, a drifting rock red. `speed` sets how fast it runs |
| Steam, smoke | rises slowly along its own curls, swaying a little | it races, or holds still | `speed` (0.6 slower), `amp` for more sway |
| Cup, chimney, anything lit behind the steam | stays still | a highlight on it rises like steam | paint it red |

## Fire

Ask for it with `scene=fire`; auto never picks it. It finds flames by colour: bright, red through yellow, and lighter than what is around them. Check `shore=show` first: only the flames should be untinted.

| Part | Should | Looks wrong when | Fix |
|---|---|---|---|
| Flames | the base holds; higher up, new thin tongues keep rising, curling and breaking off; a wide fire swells and shrinks about once a second | they slide up as one sheet, the same shape just wobbles, or the logs bend with them | `speed` (0.7 a calm hearth, 1.3 a bonfire), `amp` for how far they sway. A log reaching high into the flames sways with them; paint it red if it shows |
| The room around it | brightens and dims with the fire, most near it | it pulses on its own, or stays dead still | `amp` scales the flicker and the glow together (0.6 calm, 1.4 lively) |
| Candle wax, a lamp shade, anything the flame lights brightly | stays still (it still glows with the flame) | it rises like flame: lit wax is as bright and warm as the flame itself | paint it red. A candle almost always needs this below the flame's foot |
| Sunset, warm lamps, lit windows elsewhere | stay still | a bright orange patch rises like a flame | paint it red (a small lamp flickering along is fine to keep) |

## Twinkle

Ask for it with `scene=twinkle`; auto never picks it. It finds small bright points with a darker surround (stars, distant city lights, fairy-light bulbs) and makes each one dim and brighten at its own pace, with a soft glow around it that grows as it brightens. Check `shore=show` first: the photo is dimmed and every point found is painted green.

| Part | Should | Looks wrong when | Fix |
|---|---|---|---|
| Stars, bulbs, distant lights | each at its own pace; the big, bright ones dim and flare the most, faint ones only a little; a bulb dims as a whole | they pulse together, or barely change | `amp` for how deep (0.6 subtle, 1.3 lively), `speed` for how fast (0.5 slower) |
| Glow | a soft halo that swells as the point brightens, a few characters wide in the ASCII | a hard ring, or none at all | `amp` scales the glow with the twinkle |
| Everything else (sky, buildings, the lit room) | stays still | a lit window, a leaf or a white edge flickers | paint it red |
| A light that is missed | twinkles too | it stays still | paint it green: green always counts as a point |

## Sky

| Part | Should | Looks wrong when | Fix |
|---|---|---|---|
| Clouds | drift slowly one way, much slower than the water; shapes hold together | they race, or slide the opposite way from what the scene suggests | `clouds=0.5` to slow them; `cloud=180` to send them left (0 = right) |
| Clear sky | stays as it is | it shimmers | lower `clouds`; over water, don't use `sky=off` for this (the sky would then move with the sea). If it persists, it's a limit |
| Horizon over the sea | soft haze where sea meets sky; the far sea fades into it | a hard line, or a milky band | `haze=0.5` for more, `haze=0.2` or `0` for less |
| Sky read wrongly | only the sky drifts | sea, sand, snow or a pale building drifts like a cloud | `sky=show` to see it. Paint a building or snow red, a sea green. `sky=off` drops the sky altogether (over water it then moves with the sea) |
| Sunset band | an orange glow low in the sky | the glow sits still while the clouds above drift | orange reads as land, so it stays still. Fine for most sunsets; say so. Painting it green makes it move as water, not drift as cloud |

## Grass and other strands

| Part | Should | Looks wrong when | Fix |
|---|---|---|---|
| Grass, crops, reeds | sway together like a field in the wind, with gusts passing through; each strand bends from its root | strands lean against the obvious wind, or the whole picture slides | set `wind` (degrees, the way they should lean) |
| A golden field | keeps its colour while it moves | it goes pale or washed out | report it: that's the highlights pitfall in internals.md |
| Fur, hair, brushwork | follows its own strokes | strands look fat or blotchy | needs `scene=grass`; raise `density` (1.5–2) |
| Light on the field | stays where the photo has it | shadows on the wrong side | set `light` to where the light comes from |
| Grass on a cliff above the sea | sways; the cliff itself stays still | the cliff sways too | see "Still things" |

## Pace

- Slowest to fastest: clouds, then the far sea, the near sea, breaking foam and grass in a gust.
- If everything moves at the same speed, it looks fake even when each part is right.
- `amp` scales everything at once. If only one part is off, change that part's own option instead (`clouds`, `speed`, `drift`, `churn`).
- Motion that's correct but too small to see on a phone fails too (SKILL.md, check 2).

## Telling the user

Before rendering, say what will move and what will stay still. After, report anything that still looks off and whether it's a setting you couldn't fix or a known limit. Never present a loop as finished when a part visibly moves wrong.
