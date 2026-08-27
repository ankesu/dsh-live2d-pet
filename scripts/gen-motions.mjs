/**
 * gen-motions.mjs — generate motion3.json (actions) and exp3.json
 * (expressions) from parameter definitions, per the 全参数映射表
 * (§5 of DeepSeek郎应用手册.md).
 *
 * DeepSeek 郎 parameter dictionary (from deepseek.cdi3.json):
 *   head:     ParamAngleX / Y / Z         body: ParamBodyAngleX / Y / Z
 *   eyes:     ParamEyeLOpen / ROpen / LSmile / RSmile
 *   eyeballs: ParamEyeBallX / Y           brows: ParamBrowL(R)Y / LAngle(R) / LX(R) / LForm(R)
 *   mouth:    ParamMouthForm / OpenY      cheeks: ParamCheek
 *   breath:   ParamBreath                 hair: ParamHairFront / Side / Back
 *   tail:     Param_Angle_Rotation_1..7_tail
 *
 * Rules (contract): expressions are STATIC parameter snapshots using
 * Blend=Add (value adds onto the default, matching the vendor's exp3s);
 * motions are LINEAR curves [t, v] with auto-counted Meta.
 *
 * Usage: node scripts/gen-motions.mjs <assetsDir>
 * Writes motions/*.motion3.json and *.exp3.json next to them.
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { EXPRESSIONS } from './expressions-data.mjs'

/* ---- motion helpers ---------------------------------------------------- */

function linearCurve(id, keys) {
  if (keys.length < 2) throw new Error(`curve ${id} needs >= 2 keyframes`)
  const segs = [keys[0][0], keys[0][1]]
  for (let i = 1; i < keys.length; i++) segs.push(0, keys[i][0], keys[i][1]) // 0 = linear
  return { Target: 'Parameter', Id: id, Segments: segs }
}

function buildMotion(name, curves, { duration, fps = 60, loop = true, fadeIn = 0.1, fadeOut = 0.1 } = {}) {
  let segs = 0
  let pts = 0
  for (const c of curves) {
    const s = (c.Segments.length - 2) / 3
    segs += s
    pts += s + 1
  }
  return {
    Version: 3,
    Meta: { Duration: duration, Fps: fps, Loop: loop, AreBeziersRestricted: false, FadeInTime: fadeIn, FadeOutTime: fadeOut, CurveCount: curves.length, TotalSegmentCount: segs, TotalPointCount: pts, UserDataCount: 0, TotalUserDataSize: 0 },
    Curves: curves,
  }
}

/* ---- expressions ------------------------------------------------------- */
/* EXPRESSIONS are imported from scripts/expressions-data.mjs — a snapshot of
 * the LIVE hand-tuned exp3 files (§3 of the manual, 2026-08-27). The data
 * preserves each parameter's own Add/Overwrite blend, which a buildExpression
 * helper could not represent.
 * Refresh after hand-tuning: node scripts/sync-expressions.mjs <assetsDir> */
/* ---- §5.5 motions ------------------------------------------------------- */

/** think: 智障风 body — the face is the 'think' expression (half-lidded
 * eyes, rolled-up whites, slack mouth); here only the body slowly twists and
 * the head tilts. 2.5s loop. */
function thinkMotion() {
  const curves = [
    // body slowly twisting side to side
    linearCurve('ParamBodyAngleX', [[0, 0], [0.625, 8], [1.25, 0], [1.875, -8], [2.5, 0]]),
    // head tilted and swaying gently
    linearCurve('ParamAngleZ', [[0, 0], [0.6, 8], [1.9, 8], [2.5, 4]]),
    linearCurve('ParamAngleX', [[0, 0], [0.7, 5], [1.4, -5], [2.5, 0]]),
    // tail sways slowly, pondering
    linearCurve('Param_Angle_Rotation_3_tail', [[0, 0], [0.625, 6], [1.25, 0], [1.875, -6], [2.5, 0]]),
    linearCurve('Param_Angle_Rotation_6_tail', [[0, 0], [0.625, -5], [1.25, 0], [1.875, 5], [2.5, 0]]),
  ]
  return buildMotion('think', curves, { duration: 2.5 })
}

/** sad: hang head, one-shot. */
function sadMotion() {
  const curves = [
    linearCurve('ParamAngleY', [[0, 0], [0.4, -12], [2.1, -12], [2.5, 0]]),
    linearCurve('ParamEyeBallY', [[0, 0], [0.4, -0.5], [2.1, -0.5], [2.5, 0]]),
  ]
  return buildMotion('sad', curves, { duration: 2.5, loop: false })
}

/** wait: look around slowly, 2.5s loop. */
function waitMotion() {
  const curves = [
    linearCurve('ParamAngleX', [[0, 0], [0.6, 8], [1.2, 0], [1.8, -8], [2.5, 0]]),
    linearCurve('ParamEyeBallX', [[0, 0], [0.6, 0.6], [1.2, 0], [1.8, -0.6], [2.5, 0]]),
  ]
  return buildMotion('wait', curves, { duration: 2.5 })
}

/** wiggle: frantic squirm while dragged, 1.2s loop. */
function wiggleMotion() {
  const curves = [
    linearCurve('ParamBodyAngleX', [[0, 0], [0.15, 10], [0.3, -10], [0.45, 10], [0.6, -10], [0.75, 10], [0.9, -10], [1.05, 10], [1.2, 0]]),
    linearCurve('ParamAngleX', [[0, 0], [0.3, 8], [0.6, -8], [0.9, 8], [1.2, 0]]),
    linearCurve('Param_Angle_Rotation_3_tail', [[0, 0], [0.15, 18], [0.3, -18], [0.45, 18], [0.6, -18], [0.75, 18], [0.9, -18], [1.05, 18], [1.2, 0]]),
    linearCurve('Param_Angle_Rotation_6_tail', [[0, 0], [0.15, -14], [0.3, 14], [0.45, -14], [0.6, 14], [0.75, -14], [0.9, 14], [1.05, -14], [1.2, 0]]),
  ]
  return buildMotion('wiggle', curves, { duration: 1.2 })
}

/** type: rapid nodding while writing, 1.2s loop. */
function typeMotion() {
  const curves = [
    linearCurve('ParamAngleY', [[0, 0], [0.15, -6], [0.3, 0], [0.45, -6], [0.6, 0], [0.75, -6], [0.9, 0], [1.05, -6], [1.2, 0]]),
    linearCurve('ParamEyeBallY', [[0, -0.5], [1.2, -0.5]]),
  ]
  return buildMotion('type', curves, { duration: 1.2 })
}

/** radar: quick scan for search, 1.5s loop. */
function radarMotion() {
  const curves = [
    linearCurve('ParamAngleX', [[0, 0], [0.375, 10], [0.75, 0], [1.125, -10], [1.5, 0]]),
    linearCurve('ParamEyeBallX', [[0, 0], [0.375, 0.7], [0.75, 0], [1.125, -0.7], [1.5, 0]]),
  ]
  return buildMotion('radar', curves, { duration: 1.5 })
}

/** stare: fixed lean while browsing, 2s loop. */
function stareMotion() {
  const curves = [
    linearCurve('ParamAngleY', [[0, 0], [0.6, -4], [1.4, -4], [2, 0]]),
    linearCurve('ParamEyeBallY', [[0, 0], [0.6, 0.2], [1.4, 0.2], [2, 0]]),
  ]
  return buildMotion('stare', curves, { duration: 2 })
}

/** wave → greet: continuous nodding on hover. 1.6s loop (the nod never stops). */
function waveMotion() {
  const curves = [
    // head keeps nodding — continuous bob while hovered
    linearCurve('ParamAngleY', [[0, 0], [0.15, 7], [0.3, 0], [0.45, 7], [0.6, 0], [0.75, 7], [0.9, 0], [1.05, 7], [1.2, 0], [1.35, 7], [1.5, 0], [1.6, 3]]),
    // head tilted to look up at you
    linearCurve('ParamAngleZ', [[0, 0], [0.5, 10], [1.1, 6], [1.6, 8]]),
    // eyes look up at you
    linearCurve('ParamEyeBallY', [[0, 0], [0.5, 0.5], [1.1, 0.4], [1.6, 0.45]]),
  ]
  return buildMotion('wave', curves, { duration: 1.6 })
}

/** sleep: tilt and sink for napping, 3s loop. */
function sleepMotion() {
  const curves = [
    linearCurve('ParamAngleZ', [[0, 0], [1, 12], [2.5, 12], [3, 0]]),
    linearCurve('ParamBodyAngleY', [[0, 0], [1, 3], [2.5, 3], [3, 0]]),
  ]
  return buildMotion('sleep', curves, { duration: 3 })
}

/** happy upgrade: original celebration + 2 eager nods, 1.6s loop. */
function happyMotion() {
  const tail = []
  for (let i = 1; i <= 7; i++) {
    const phase = (i - 1) * 0.05
    tail.push(linearCurve(`Param_Angle_Rotation_${i}_tail`, [[0, -10 - phase * 8], [0.3, 12 + phase * 8], [0.6, -10 - phase * 8], [0.9, 12 + phase * 8], [1.2, -10 - phase * 8], [1.6, 0]]))
  }
  const curves = [
    linearCurve('ParamAngleX', [[0, 0], [0.4, 8], [0.8, 0], [1.2, -8], [1.6, 0]]),
    linearCurve('ParamAngleY', [[0, 0], [0.2, 6], [0.4, 0], [0.6, 6], [0.8, 0], [1.2, 0], [1.4, 6], [1.6, 0]]),
    linearCurve('ParamMouthForm', [[0, 0.4], [1.6, 0.4]]),
    linearCurve('ParamEyeLSmile', [[0, 0.8], [1.6, 0.8]]),
    linearCurve('ParamEyeRSmile', [[0, 0.8], [1.6, 0.8]]),
    linearCurve('ParamCheek', [[0, 0], [0.3, 0.6], [1.6, 0.6]]),
    ...tail,
  ]
  return buildMotion('happy', curves, { duration: 1.6 })
}

/* ---- legacy motions kept ----------------------------------------------- */

/** think_light: the ordinary-thinking micro-motion — a visible head tilt and
 * a wandering gaze so "thinking" reads on a small canvas. 2s loop. */
function thinkLightMotion() {
  const curves = [
    linearCurve('ParamAngleZ', [[0, 0], [0.5, 5], [1.0, 0], [1.5, -5], [2.0, 0]]),
    linearCurve('ParamAngleX', [[0, 0], [0.5, 3], [1.0, -3], [1.5, 3], [2.0, 0]]),
    linearCurve('ParamEyeBallX', [[0, 0], [0.5, 0.4], [1.0, -0.4], [1.5, 0.3], [2.0, 0]]),
  ]
  return buildMotion('think_light', curves, { duration: 2 })
}

function pwshMotion() {
  const curves = [
    linearCurve('ParamBodyAngleX', [[0, 0], [0.25, 6], [0.5, -4], [0.75, 6], [1.0, -4], [1.25, 6], [1.5, -4], [1.75, 6], [2.0, 0]]),
    linearCurve('ParamBodyAngleZ', [[0, 0], [0.5, 5], [1.0, 0], [1.5, -5], [2.0, 0]]),
    linearCurve('ParamAngleX', [[0, 0], [0.3, 10], [0.6, -10], [0.9, 10], [1.2, -10], [1.5, 10], [1.8, -10], [2.0, 0]]),
    linearCurve('ParamAngleZ', [[0, 0], [0.4, 5], [0.8, -5], [1.2, 5], [1.6, -5], [2.0, 0]]),
    linearCurve('ParamEyeBallX', [[0, 0], [0.25, 0.8], [0.5, 0], [0.75, -0.8], [1.0, 0], [1.25, 0.8], [1.5, 0], [1.75, -0.8], [2.0, 0]]),
    linearCurve('ParamEyeBallY', [[0, 0], [0.3, 0.5], [0.6, 0], [1.0, 0.5], [1.3, 0], [1.6, 0.5], [2.0, 0]]),
    linearCurve('ParamHairFront', [[0, 0], [0.5, 10], [1.0, 0], [1.5, -10], [2.0, 0]]),
    linearCurve('ParamHairSide', [[0, 0], [0.5, -8], [1.0, 0], [1.5, 8], [2.0, 0]]),
    linearCurve('ParamBrowLY', [[0, 0], [0.5, 0.3], [1.5, 0.3], [2.0, 0]]),
    linearCurve('ParamBrowRY', [[0, 0], [0.5, 0.3], [1.5, 0.3], [2.0, 0]]),
    linearCurve('ParamMouthOpenY', [[0, 0], [0.5, 0.35], [1.5, 0.35], [2.0, 0]]),
    linearCurve('Param_Angle_Rotation_3_tail', [[0, 0], [0.25, 15], [0.5, -15], [0.75, 15], [1.0, -15], [1.25, 15], [1.5, -15], [1.75, 15], [2.0, 0]]),
    linearCurve('Param_Angle_Rotation_6_tail', [[0, 0], [0.25, -12], [0.5, 12], [0.75, -12], [1.0, 12], [1.25, -12], [1.5, 12], [1.75, -12], [2.0, 0]]),
  ]
  return buildMotion('pwsh', curves, { duration: 2 })
}

function readMotion() {
  const curves = [
    linearCurve('ParamEyeBallX', [[0, -0.5], [1.2, 0.5], [2.4, -0.5]]),
    linearCurve('ParamAngleX', [[0, -2], [1.2, 2], [2.4, -2]]),
    linearCurve('ParamBrowLY', [[0, 0.15], [2.4, 0.15]]),
    linearCurve('ParamBrowRY', [[0, 0.15], [2.4, 0.15]]),
  ]
  return buildMotion('read', curves, { duration: 2.4 })
}

/* ---- CLI ---------------------------------------------------------------- */

const MOTIONS = {
  pwsh: pwshMotion(),
  read: readMotion(),
  happy: happyMotion(),
  think: thinkMotion(),
  think_light: thinkLightMotion(),
  sad: sadMotion(),
  wait: waitMotion(),
  wiggle: wiggleMotion(),
  type: typeMotion(),
  radar: radarMotion(),
  stare: stareMotion(),
  wave: waveMotion(),
  sleep: sleepMotion(),
}

const args = process.argv.slice(2)
// --force: also overwrite existing exp3 files (DANGER: clobbers manual
// tuning). Default: existing exp3 files are SKIPPED (manual tuning wins).
const force = args.includes('--force')
const outDir = resolve(args.find((a) => !a.startsWith('--')) ?? 'generated-motions')
const motionsDir = join(outDir, 'motions')
mkdirSync(motionsDir, { recursive: true })

for (const [name, motion] of Object.entries(MOTIONS)) {
  const file = join(motionsDir, `${name}.motion3.json`)
  writeFileSync(file, JSON.stringify(motion, null, '\t'))
  console.log(`✓ 动作 ${name}.motion3.json  (${motion.Meta.CurveCount} curves, ${motion.Meta.TotalPointCount} pts, ${motion.Meta.Duration}s${motion.Meta.Loop ? ' 循环' : ' 一次性'})`)
}
let skipped = 0
for (const [name, expr] of Object.entries(EXPRESSIONS)) {
  const file = join(outDir, `${name}.exp3.json`)
  if (!force && existsSync(file)) {
    console.log(`⏭ 表情 ${name}.exp3.json 已存在（手动调参？）——跳过，不覆盖（加 --force 才强制重写）`)
    skipped++
    continue
  }
  writeFileSync(file, JSON.stringify(expr, null, '\t'))
  console.log(`✓ 表情 ${name}.exp3.json  (${expr.Parameters.length} params)`)
}
if (skipped) console.log(`\n⚠️ 跳过了 ${skipped} 个已存在的表情文件——手动调参受保护，没被覆盖`)
console.log('\n用法备忘: node gen-motions.mjs <输出目录> [--force]  (默认跳过已有 exp3)')
