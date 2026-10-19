/**
 * Merge rules for end-to-end synced passwords (pure).
 *
 * Each side knows the password (or its absence) and when it was set. Timestamps
 * come from inside the encrypted blob (remote) and from this PC's sync state
 * (local), so a metadata edit (name, notes…) never counts as "newer password".
 */

export interface LocalSide {
  /** Password in this PC's vault (undefined/'' = none). */
  password?: string
  /** When this PC last set (or deliberately cleared) the password. 0/undefined = unknown. */
  at?: number
}

export interface RemoteSide {
  /** Decrypted remote password (undefined = no blob, or it could not be decrypted). */
  password?: string
  /** Timestamp stored inside the blob (falls back to the row's updated_at). */
  at?: number
}

/**
 * - `pull`: write the remote password to this PC's vault.
 * - `push`: upload this PC's password (or clear the remote blob if it was deleted here after the remote one was set).
 * - `none`: both sides agree (or neither has anything).
 * - `conflict`: both have different passwords and this PC doesn't know when its
 *   own was set (e.g. it existed before sync). Never overwrite it silently: the
 *   user picks one.
 */
export type MergeAction = 'none' | 'pull' | 'push' | 'conflict'

export function decideMerge(local: LocalSide, remote: RemoteSide): MergeAction {
  const hasLocal = !!local.password
  const hasRemote = remote.password !== undefined && remote.password !== ''
  const lAt = Number(local.at) || 0
  const rAt = Number(remote.at) || 0
  if (!hasLocal && !hasRemote) return 'none'
  if (hasLocal && hasRemote && local.password === remote.password) return 'none'
  if (hasLocal && !hasRemote) return 'push'
  if (!hasLocal && hasRemote) {
    // Cleared here after the remote one was set → propagate the deletion.
    return lAt > rAt ? 'push' : 'pull'
  }
  // Both have different passwords: without a local timestamp there's no way to tell → ask.
  if (!lAt) return 'conflict'
  return lAt > rAt ? 'push' : 'pull'
}

/** Per-item status shown in the list / detail. */
export type ItemSyncState = 'synced' | 'local' | 'remote' | 'conflict'

/**
 * `known` = hashes of the (local password, remote blob) pair this PC last saw
 * agreeing. Synced only when both still match: anything else means one side
 * changed since and the next merge has work to do.
 */
export function itemSyncState(s: {
  localHash?: string
  remoteBlobHash?: string
  known?: { pwd: string; blob: string }
  /** Remote blob hash the item was in conflict with (still a conflict while that blob is there). */
  conflictBlob?: string
}): ItemSyncState | undefined {
  if (s.localHash && s.conflictBlob && s.conflictBlob === s.remoteBlobHash) return 'conflict'
  if (s.localHash) {
    return s.known && s.known.pwd === s.localHash && s.known.blob === s.remoteBlobHash ? 'synced' : 'local'
  }
  return s.remoteBlobHash ? 'remote' : undefined
}

export interface SyncCounts { synced: number; local: number; remote: number; conflict: number }

export function countStates(states: (ItemSyncState | undefined)[]): SyncCounts {
  const c: SyncCounts = { synced: 0, local: 0, remote: 0, conflict: 0 }
  for (const s of states) if (s) c[s]++
  return c
}
