# FOREMAN

FOREMAN is an installer for the **harness-subagents** skill that supports two
installation modes: **local** and **global**.

---

## Installation Modes

### Local Mode
All files — including dynamic progress data — are created **inside** the
target workspace directory. This is the default.

```
<workspace>/
├── AGENTS.md
├── CHECKPOINTS.md
└── progress/
    ├── current/
    │   └── state.md
    ├── history/
    │   └── index.md
    └── docs/
```

### Global Mode
Static config files (`AGENTS.md`, `CHECKPOINTS.md`) are placed in the
workspace, but **dynamic progress data is stored outside** the repository under
a shared FOREMAN workspace directory:

```
~/FOREMAN/<project-name>/
└── progress/
    ├── current/
    │   └── state.md
    ├── history/
    │   └── index.md
    └── docs/
```

The `<project-name>` is derived from the **name of the target directory**.

Both `AGENTS.md` and `CHECKPOINTS.md` are generated with references that
point to the global path, so all agent operations read/write there.

---

## Usage

```bash
# Show help
./install.sh --help

# Install locally in the current directory (default)
./install.sh
./install.sh --mode local

# Install globally (progress data goes to ~/FOREMAN/<project>/)
./install.sh --mode global

# Install into a specific directory
./install.sh --mode local  --target /path/to/project
./install.sh --mode global --target /path/to/project
```

---

## Project Structure

```
foreman/
├── install.sh          # Main installer script
├── lib/
│   └── foreman.sh      # Shared helper functions
├── templates/
│   └── progress/       # Seed templates for the progress directory
│       ├── current/
│       ├── history/
│       └── docs/
└── README.md
```

---

## Generated Files

| File | Description |
|------|-------------|
| `AGENTS.md` | Agent configuration — defines paths for all harness-subagents operations |
| `CHECKPOINTS.md` | Checkpoint tracker — links to history and active task state |
| `progress/current/state.md` | Active task context (updated each session) |
| `progress/history/index.md` | Table of completed tasks |
| `progress/docs/` | Generated documentation |

> **Tip — Global Mode:** Add `progress/` to `.gitignore` in your workspace if
> you are using local mode, or simply don't commit it since global mode keeps
> it outside the repo entirely.

---

## Configuration

The global base directory name is controlled by the `FOREMAN_PROJECT_NAME`
constant in `install.sh` (default: `FOREMAN`). Change it before running the
installer if you want a different root directory name.
