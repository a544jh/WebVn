# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

Edit the right-hand column to match whatever vocabulary you actually use.

## Beyond triage: `done`

`done` is ours, not one of the five. No skill sets it and nothing reads it - it exists so the tracker
tells finished work apart from work still waiting for an agent, which the five roles cannot say.

Set it once a ticket's work is implemented and pushed, and record where it landed (the PR, or the
commits) under the ticket's `## Comments` heading. A ticket whose work is still in progress keeps the
triage label it had: `done` is not a claim, and there is no `in-progress`.
