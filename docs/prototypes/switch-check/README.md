# The switch's check of the compiler

`compare.py` holds a course's bundle in the new shape against the one the main branch's compiler writes,
item by item ([the design note](../../migration-design.md), deliverable 3, stage 2).

```
cd pipeline && for c in ../courses/*/; do uv run nabu build "$c" --out /tmp/next; done
python3 docs/prototypes/switch-check/compare.py apps/web/public/bundles /tmp/next
```

The old bundles are the committed ones (`apps/web/public/bundles`) for as long as the branch keeps them,
and the main branch's after that. It reads the two bundles and the new one's alias table, and nothing else.
The design note records what it found on the day the compiler was moved.
