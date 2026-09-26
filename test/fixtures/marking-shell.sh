#!/bin/bash
# Test-only shell: proves pi used the configured shellPath.
export PI_SHELL_MARK=applied
exec /bin/bash "$@"
