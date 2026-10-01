#!/bin/sh
# Test double for git in tests/e2e.sh: real git ($REAL_GIT), except that the release
# URL is served from the local repo $E2E_RELEASE_REPO. The installer only allows
# HTTPS, so file:// is allowed here, and a clone gets its real origin URL back.
release_url=https://github.com/getpapersh/paperland.git
dest=
for arg do
  if [ "$arg" = "$release_url" ]; then arg=$E2E_RELEASE_REPO; fi
  set -- "$@" "$arg"
  dest=$arg
  shift
done
case " $* " in
  *" clone "*)
    "$REAL_GIT" -c protocol.file.allow=always "$@" || exit
    exec "$REAL_GIT" -C "$dest" remote set-url origin "$release_url" ;;
  *) exec "$REAL_GIT" -c protocol.file.allow=always "$@" ;;
esac
