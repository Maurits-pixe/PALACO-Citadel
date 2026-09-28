import { constants } from 'node:fs';
import { lstat, realpath, mkdir, readdir, open, link, unlink, readFile } from 'node:fs/promises';
import { isAbsolute, resolve, relative, join, parse, sep } from 'node:path';
import { randomUUID } from 'node:crypto';

// Operator configuration only. Not a request-supplied path or a tenant boundary.
export class ConfinedStore {
  #identity;
  constructor(root, allowedRoot, { fault = async () => {} } = {}) {
    for (const path of [root, allowedRoot]) {
      if (typeof path !== 'string' || !isAbsolute(path) || path.split(/[\\/]/).includes('..')) throw Error('absolute root without traversal required');
    }
    this.root = resolve(root);
    this.allowedRoot = resolve(allowedRoot);
    const suffix = relative(this.allowedRoot, this.root);
    if (suffix.startsWith('..') || isAbsolute(suffix)) throw Error('storage outside allowed root');
    this.fault = fault;
  }
  async #directory(path, create = false) {
    let current = parse(path).root;
    for (const component of path.slice(current.length).split(sep).filter(Boolean)) {
      current = join(current, component);
      if (create && (current === this.root || current.startsWith(this.root + sep))) {
        try { await mkdir(current, { mode: 0o700 }); } catch (e) { if (e.code !== 'EEXIST') throw e; }
      }
      const stat = await lstat(current);
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw Error('symlink or non-directory rejected');
      if (current === this.root || current.startsWith(this.root + sep)) {
        if ((stat.mode & 0o077) !== 0 || (process.getuid && stat.uid !== process.getuid())) throw Error('private directory ownership/mode required');
      }
    }
    if (await realpath(path) !== path) throw Error('noncanonical storage path');
  }
  async initialize() {
    // This profile requires POSIX permission/fsync semantics. Windows ACL profile is OPEN.
    if (process.platform === 'win32') throw Error('Windows ACL storage profile not verified');
    await this.#directory(this.allowedRoot);
    await this.#directory(this.root, true);
    const stat = await lstat(this.root);
    if (this.#identity && (stat.dev !== this.#identity.dev || stat.ino !== this.#identity.ino)) throw Error('storage root replaced');
    this.#identity = { dev: stat.dev, ino: stat.ino };
  }
  async directory(parts, create = false) {
    await this.initialize();
    if (!Array.isArray(parts) || parts.some(x => typeof x !== 'string' || !/^[A-Za-z0-9_.-]+$/.test(x) || x === '.' || x === '..')) throw Error('invalid storage path');
    const path = join(this.root, ...parts);
    await this.#directory(path, create);
    return path;
  }
  async list(parts) {
    let path;
    try { path = await this.directory(parts); } catch (e) { if (e.code === 'ENOENT') return []; throw e; }
    return readdir(path);
  }
  async recover(parts) {
    let dir;
    try { dir = await this.directory(parts); } catch (e) { if (e.code === 'ENOENT') return; throw e; }
    const lock = join(dir, '.writer.lock');
    let lockExists = true;
    let metadata = null;
    try { metadata = JSON.parse(await readFile(lock, 'utf8')); }
    catch (e) { if (e.code === 'ENOENT') lockExists = false; else throw Error('writer lock unavailable; recovery required'); }
    if (lockExists) {
      const pid = Number(metadata?.pid);
      if (!Number.isInteger(pid) || pid <= 0 || !Number.isFinite(Date.parse(metadata?.started_at))) throw Error('writer lock unavailable; recovery required');
      let alive = false;
      if (Number.isInteger(pid) && pid > 0) {
        try { process.kill(pid, 0); alive = true; } catch (e) { alive = e.code !== 'ESRCH'; }
      }
      if (alive) throw Error('writer lock unavailable; recovery required');
      // The owner is gone. The lock and any staged bytes are recoverable because
      // publication uses a no-replace hard link: a final event is either absent
      // or complete, never a partially written destination.
      await unlink(lock).catch(e => { if (e.code !== 'ENOENT') throw e; });
    }
    for (const name of await readdir(dir)) {
      if (name.startsWith('.pending-')) await unlink(join(dir, name)).catch(e => { if (e.code !== 'ENOENT') throw e; });
    }
  }
  async read(parts, name) {
    if (!/^[A-Za-z0-9_.-]+$/.test(name) || name === '.' || name === '..') throw Error('invalid filename');
    const path = join(await this.directory(parts), name);
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || (stat.mode & 0o077) !== 0) throw Error('unsafe file');
    const fd = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const actual = await fd.stat();
      if (actual.ino !== stat.ino || actual.dev !== stat.dev || actual.size > 8 * 1024 * 1024) throw Error('file changed or oversized');
      return await fd.readFile('utf8');
    } finally { await fd.close(); }
  }
  async atomicCreate(parts, name, text) {
    if (!/^[A-Za-z0-9_-]+\.json$/.test(name)) throw Error('invalid filename');
    const dir = await this.directory(parts, true);
    const staged = join(dir, `.pending-${randomUUID()}`);
    const destination = join(dir, name);
    const fd = await open(staged, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    try {
      await fd.writeFile(text);
      await this.fault('before-file-sync');
      await fd.sync();
    } catch (e) { await fd.close(); await unlink(staged); throw e; }
    await fd.close();
    try {
      await this.fault('before-event-commit');
      await this.directory(parts);
      // Hard-link publishes complete bytes atomically and refuses to replace an existing event.
      await link(staged, destination);
    } finally { await unlink(staged); }
    const dirfd = await open(dir, constants.O_RDONLY | constants.O_DIRECTORY);
    try { await dirfd.sync(); } finally { await dirfd.close(); }
  }
  async locked(parts, fn) {
    const dir = await this.directory(parts, true);
    await this.recover(parts);
    const lock = join(dir, '.writer.lock');
    let fd;
    try { fd = await open(lock, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600); }
    catch { throw Error('writer lock unavailable; recovery required'); }
    try {
      await fd.writeFile(JSON.stringify({ pid: process.pid, started_at: new Date().toISOString() }));
      await fd.sync();
      return await fn();
    }
    finally { await fd.close(); await unlink(lock); }
  }
}
