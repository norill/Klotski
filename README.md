# Klotski State Explorer

A browser-based explorer for the 4×5 Klotski state space.

## Model

- Board: 4×5 cells
- Vertical block: 1×2
- Horizontal block: 2×1
- Unique square block: 2×2
- Singlet: 1×1
- Moves: orthogonal, exactly one cell per move
- Goal: the 2×2 block occupies the bottom-center 2×2 area (columns 1–2, rows 3–4 using zero-based coordinates)

There is deliberately **no initial arrangement**. A setup is determined by the counts `(V,H,Q,S)`, with `Q=1` and

`2V + 2H + 4 + S = 20`.

The app enumerates every valid tiling for the selected setup directly, then generates every legal one-square transition between those states. Identical blocks of the same type are treated as indistinguishable by canonicalizing their positions.

## Running

Serve this directory with any static HTTP server and open `index.html`. No build step or external dependency is required.

The UI lets you:

- choose a block-count setup;
- enumerate/cache all states for that setup;
- see the number of states and transitions;
- inspect the board represented by a selected graph node;
- switch between connected components if a setup has more than one;
- optionally display node IDs.

## Architecture

`app.js` contains the complete state-space model:

1. Generate all tilings by repeatedly filling the first empty cell.
2. Encode each state canonically as sorted positions per block type.
3. Generate legal one-cell moves.
4. Build the undirected state graph.
5. Find connected components for visualization.

`index.html` and `styles.css` provide the minimal UI and board/graph presentation.
