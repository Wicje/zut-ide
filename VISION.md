# Zut — the vision

Write this down so the next person picks it up without a meeting.

## One line

**Cursor's agent working on a machine you don't have to own.** The agent
writes the files — and the installs, builds and runs happen on *our*
machines (or yours, if you prefer), so a phone, a Chromebook or a 4GB
laptop can still build real software.

## Who it is for

People with capable networks and incapable machines:

- a phone,
- a Chromebook,
- a laptop with 4GB of RAM (8GB is "comfortable" here),
- anyone who opens a browser and expects to work.

Nothing to install. If it has a browser, it has Zut. The IDE also renders
in a terminal window (kitty graphics protocol), because some people live
there.

We are **not** building for students. We happened to land in a student
environment — academies, bootcamps, universities — so that is where the
first testers come from. That is a *validation ground*, not a target
market. It just happens to be the densest collection of (a) people whose
machines are exactly the machines we serve, and (b) teachers who need a
shared, zero-install editor today.

## The wall everyone else runs into

The new agent IDEs all hit the same wall, in different places:

| Product | Where the agent writes | Where the build runs | Where you hand-write code |
| --- | --- | --- | --- |
| Cursor | your machine | **your machine** | your machine, full IDE |
| Lovable / Bolt | their cloud | their cloud | not really — you rent a result |
| Replit | their cloud | their cloud | their cloud IDE |
| Zut | your machine or ours | **our machines (Zut Compute)** or yours | anywhere, in the browser |

- **Cursor** is the rival we go after. Its agent is excellent — and then
  `npm install` runs on your laptop, and a 4GB machine is the wall. The
  fan spins, the swap thrashes, and the "effortless" part is over.
- **Lovable and Bolt** generate an app in their cloud and hand you a
  deploy. You are a renter of a result, not a builder: no hand-written
  code, no real repo, no diff you can own line by line.
- **Zut** keeps the agentic workflow and moves the heavy part to Zut
  Compute. The gap between "what the agent can write" and "what your
  machine can build" is the product.

## The ecosystem we want

Exactly like Cursor or VS Code, in the browser or the terminal:

- **Hand-write code when you want.** Monaco editor, file tabs, keyboard
  shortcuts, formatter. The agent is a choice per turn, not a cage.
- **Let the agent type when you don't.** Prompt in plain language; plan
  mode writes a checklist you tick off; every turn lands as a per-file
  diff you accept or revert, with checkpoints.
- **Connectors, not lock-in.** Your Supabase, your GitHub, your Vercel.
  Your keys stay in your browser. AI is optional: plain code + Run works
  with no key at all.

## Where the code runs

Two homes for the agent, one choice at signup (switchable later):

1. **Self-host** — opencode or a `zut host` on your own machine. Your
   models, your keys, your quota, a real PTY, real git. Available today,
   free.
2. **Zut Compute** — the same workflow, paid for by run time, on our
   servers. Coming online with the VPS. This is the default dream for the
   phone-and-Chromebook crowd: install nothing, run anything.

Editing is free. Only runs use run time.

## How we will know it works

Before going outside the university environment:

1. A teacher hand-writes code from the browser on the projector — no
   install day, no "run this script first".
2. A student on a Chromebook prompts the agent, reviews the diff, ticks
   off a plan, deploys to Vercel.
3. A whole bootcamp works off one link, and nobody asks for admin rights.

If those three happen without anyone installing anything, the idea is
validated — then we go find the rest of the market.

## What we are not

- Not a model vendor. Bring your own key; the model picker lists whatever
  your agent serves.
- Not a walled garden. Your code is your code: real files, real git, real
  deploys, share links when you want them.
- Not "AI-only". The IDE works with no AI configured at all.
