#!/bin/bash
# Test-only shell for R7.3: proves pi used the configured shellPath.
export PI_SHELL_MARK=applied
exec /bin/bash "$@"
