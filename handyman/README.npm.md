# handyman-harness

CLI toolchain for the [Handyman](https://github.com/RodrigoMardones/handyman)
agent harness: leader/implementer/reviewer roles working one feature at a
time with disk state and executable verification.

## Usage

```bash
npx handyman-harness <verb> [args...]
```

Verbs: `backlog`, `evals`, `feature`, `index_md`, `metrics`, `preflight`,
`sprint`, `toolbox`, `tools_discovery`, `update_harness`, `upgrade_harness`,
`validate_harness`. Each verb accepts `--help`.

Typical loop inside a harness project:

```bash
npx handyman-harness preflight          # read-only stability report
npx handyman-harness feature ready     # exit 0: claimable work, exit 3: drained
npx handyman-harness feature start <name>
npx handyman-harness feature done <name>
```

The harness workspace (`.handyman/` or `$HOME/HANDYMAN/<project>`) and the
full workflow are documented in the
[Handyman repository](https://github.com/RodrigoMardones/handyman).

## License

MIT — see LICENSE and NOTICE.
