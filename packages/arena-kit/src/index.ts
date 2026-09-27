/**
 * Real-time arena games ke liye shared, pure math — koi game-rule yahan nahi.
 *
 * Bomb Tag aur Freeze Tag dono ko bilkul yahi cheezein chahiye thi (position, distance, arena
 * bounds, spawn points, deterministic random). Teesri copy banane ke bajaye inhe yahan nikaal
 * diya. Game-specific sab kuch (config, state machine, collision ka matlab, win conditions) har
 * game ke apne engine package me hi rehta hai — taaki ek game ke rules badalne se doosra kabhi
 * na toote.
 *
 * Yahan koi framework/IO import nahi hota (ESLint bhi rokta hai) — bilkul pure aur testable.
 */
export * from './geometry';
export * from './movement';
export * from './random';
