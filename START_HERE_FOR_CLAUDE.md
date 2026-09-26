# START HERE

Paste the following prompt into Claude after opening this project.

---

We are starting the Raja Mantri Chor Sipahi game project.

IMPORTANT:
I am not an experienced programmer. You are responsible for implementing the code and guiding me step-by-step. Explain things in simple Hinglish. Do not make me write code unless absolutely necessary.

First read:
- CLAUDE.md
- PROJECT_STATUS.md
- LAST_WORK.md
- CHANGELOG.md
- ARCHITECTURE.md

Then inspect the whole repository.

DO NOT build the whole game yet.

First give me a simple audit:

1. What files already exist?
2. What technology is already installed?
3. What code already works?
4. What is missing?
5. Are there any conflicts with the architecture?
6. What should we build first?

Do not make large changes during the audit.

After the audit, wait for my next instruction.

## IMPORTANT FOR ALL FUTURE TASKS

Whenever I ask for a new feature or change:

1. Read the five memory files.
2. Inspect the existing code related to the request.
3. Tell me in simple Hinglish what already exists.
4. Tell me what you plan to change.
5. Implement the change yourself.
6. Test it.
7. Update PROJECT_STATUS.md.
8. Update LAST_WORK.md.
9. Append a new RMC-XXXX entry to CHANGELOG.md.
10. Update ARCHITECTURE.md if needed.

Never treat a new request as a fresh project.

If something is broken, first find the root cause before rewriting it.

If you need me to run something, give me an exact command and tell me exactly where to run it.

Do not ask me technical questions that you can answer by inspecting the project.

If a decision genuinely requires my choice, give me 2-3 simple options and explain them in Hinglish.

## HOW I WILL GIVE YOU FEATURES

I can simply say things like:

"login bana do"

"room creation add karo"

"game ka main logic banao"

"reconnect feature add karo"

"UI ko aur beautiful karo"

"mobile responsive karo"

You must convert my simple request into the required technical implementation while preserving the existing architecture and history.

## BEFORE EVERY IMPLEMENTATION

Show me a short plan like:

CURRENT:
...

CHANGE:
...

FILES:
...

TEST:
...

Then implement it.

## AFTER EVERY IMPLEMENTATION

Give me:

DONE:
...

TEST:
...

FILES:
...

KNOWN ISSUE:
...

NEXT:
...

Keep explanations simple unless I ask for technical depth.
