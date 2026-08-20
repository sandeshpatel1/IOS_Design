import { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import { Link, scroller } from 'react-scroll';
import {
  motion, useMotionValue, useTransform, useVelocity, useSpring, animate,
} from 'framer-motion';
import {
  HiOutlineHome, HiOutlineUser, HiOutlineSparkles,
  HiOutlineSquares2X2, HiOutlineChatBubbleLeftRight,
} from 'react-icons/hi2';
import { useScrollDirection } from '../../hooks/useScrollDirection';
import './Navbar.css';

const navItems = [
  { label: 'Home',     to: 'home',     Icon: HiOutlineHome },
  { label: 'Story',    to: 'about',    Icon: HiOutlineUser },
  { label: 'Skills',   to: 'skills',   Icon: HiOutlineSparkles },
  { label: 'Work',     to: 'projects', Icon: HiOutlineSquares2X2 },
  { label: 'Contact',  to: 'contact',  Icon: HiOutlineChatBubbleLeftRight },
];

const MOVE_SPRING = { type: 'spring', stiffness: 320, damping: 36, mass: 1 };
const SCROLL_DURATION = 500;
const SPY_SUPPRESS_MS = SCROLL_DURATION + 200;
const PILL_INSET = 2;
const MOBILE_BREAKPOINT = '(max-width: 900px)';

// ── Liquid pill stretch (unchanged from before) ──
// The pill's CENTRE always sits exactly under the finger (or exactly on the
// active tab's centre when idle) — no per-tab "anchor" that jumps between
// slots. Its WIDTH reacts to how fast the centre is moving: fast = stretched
// (rubber band), slow/stopped = relaxed back to a normal circle. Kept
// deliberately subtle (single-digit px) — a small stretch reads as fluid
// and smooth, a large one reads as "broken" or rubbery in a bad way.
const STRETCH_VELOCITY_FACTOR = 0.02; // extra px of pill width per px/s of centre speed
const MAX_PILL_STRETCH_PX = 9;        // hard cap on the pill's own extra width, in px
const VELOCITY_SPRING = { stiffness: 180, damping: 22, mass: 0.55 }; // "rubberiness" of the pill's own snap-back

// ── Elastic navbar edges (new) ──
// Dragging the finger past the bar's own bounds now has resistance instead
// of following 1:1 — the classic rubber-band pull. The background layer
// (`.tabbar-elastic-bg`) is a separate element behind the icons whose width
// is derived every frame from wherever the pill currently is, so it always
// grows just enough on whichever side the pill is pushing toward and never
// lets the pill get visually cut off, then relaxes back the instant the
// pill is back inside the resting bounds. Same "keep it small" rule as the
// pill stretch above — a few px reads as premium, more reads as sloppy.
const OVERSHOOT_RESISTANCE = 0.35; // 0..1 — lower = more resistance pulling the finger
const MAX_FINGER_OVERSHOOT = 8;    // px the pill's centre can be dragged past the bar's edge, BEFORE screen-edge clamping
const BG_EDGE_BUFFER = 4;          // px slack so the bg's rounded corner always clears the pill's
const SCREEN_EDGE_MARGIN = 6;      // px of breathing room the stretch must always leave from the true screen edge

// The whole bar (icon row included) gets a much smaller "sympathetic"
// version of the same stretch, so it reads as one elastic piece of rubber
// rather than just the background capsule moving on its own.
const SYMPATHETIC_FRACTION = 0.3; // how much of the (already screen-clamped) stretch the whole bar borrows
const SYMPATHETIC_MAX_PX = 3;     // hard cap on the whole bar's own shift/stretch, in px

export default function Navbar({ config }) {
  const [active, setActive] = useState('home');
  const resumeUrl = config?.resumeUrl || '#';
  const { direction, scrolled } = useScrollDirection();
  const tucked = scrolled && direction === 'down';

  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(MOBILE_BREAKPOINT).matches
  );
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_BREAKPOINT);
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const tabWrapRef = useRef(null);
  const dragRef = useRef({ dragging: false, startX: 0, moved: false });

  // `active` is read inside pointer-move/up handlers via a ref, not the
  // React state closure directly — plain state can be one render stale
  // inside a fast pointer-move burst, which previously caused the pill to
  // settle on the wrong tab on release.
  const activeRef = useRef(active);
  useEffect(() => { activeRef.current = active; }, [active]);

  const [layout, setLayout] = useState({
    contentWidth: 0, originOffset: 0, barWidth: 0, leftSlack: 0, rightSlack: 0,
  });

  useLayoutEffect(() => {
    const wrap = tabWrapRef.current;
    if (!wrap) return;
    const measure = () => {
      const style = getComputedStyle(wrap);
      const paddingLeft = parseFloat(style.paddingLeft) || 0;
      const paddingRight = parseFloat(style.paddingRight) || 0;
      const rect = wrap.getBoundingClientRect();
      // How much real room exists between the bar's current edges and the
      // actual screen edges — this is what the stretch is allowed to use,
      // never a flat assumed px value, since it varies a lot by device
      // width (the bar already nearly fills narrow screens, leaving very
      // little slack on either side).
      setLayout({
        contentWidth: wrap.clientWidth - paddingLeft - paddingRight,
        originOffset: paddingLeft,
        barWidth: rect.width,
        leftSlack: Math.max(0, rect.left - SCREEN_EDGE_MARGIN),
        rightSlack: Math.max(0, window.innerWidth - rect.right - SCREEN_EDGE_MARGIN),
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, []);

  const { contentWidth, originOffset, barWidth, leftSlack, rightSlack } = layout;
  const slotWidth = contentWidth / navItems.length;
  const baseWidth = Math.max(slotWidth - PILL_INSET * 2, 10);

  const indexOf = useCallback((key) => {
    const i = navItems.findIndex(t => t.to === key);
    return i === -1 ? 0 : i;
  }, []);

  const centerXFor = useCallback((index) => (
    originOffset + index * slotWidth + slotWidth / 2
  ), [originOffset, slotWidth]);

  // ── Pill motion values ──
  const fingerX = useMotionValue(0);
  const rawVelocity = useVelocity(fingerX);
  const smoothVelocity = useSpring(rawVelocity, VELOCITY_SPRING);

  const pillStretch = useTransform(smoothVelocity, (v) => (
    Math.min(Math.abs(v) * STRETCH_VELOCITY_FACTOR, MAX_PILL_STRETCH_PX)
  ));

  // scaleX (a transform) instead of animating `width` directly — keeps the
  // stretch effect fully GPU-compositable instead of triggering layout on
  // every frame of the drag.
  const pillScaleX = useTransform(pillStretch, (extra) => (
    baseWidth ? (baseWidth + extra) / baseWidth : 1
  ));
  const pillX = useTransform(fingerX, (cx) => cx - baseWidth / 2);

  // ── Elastic background derivation ──
  // Purely a function of where the pill's edges currently are relative to
  // the bar's resting content bounds, THEN clamped per-side to the real
  // screen slack measured above — so however far the pill itself wants to
  // push, the visible bulge can never physically exceed the room actually
  // available on that side of the screen. Positive = growing right,
  // negative = growing left.
  const clampedOverflow = useTransform([fingerX, pillStretch], ([cx, extra]) => {
    const half = (baseWidth + extra) / 2;
    const rightEdge = cx + half;
    const leftEdge = cx - half;
    const barMin = originOffset;
    const barMax = originOffset + contentWidth;
    const overRight = Math.max(0, rightEdge - barMax);
    const overLeft = Math.max(0, barMin - leftEdge);

    const rightCap = Math.max(0, rightSlack - BG_EDGE_BUFFER);
    const leftCap = Math.max(0, leftSlack - BG_EDGE_BUFFER);
    const cRight = Math.min(overRight, rightCap);
    const cLeft = Math.min(overLeft, leftCap);
    return cRight >= cLeft ? cRight : -cLeft;
  });

  // Fixed transform-origin at the left edge for both directions — growing
  // right is a plain scale from x:0; growing left is the same scale plus a
  // compensating negative x so the RIGHT edge stays anchored instead.
  const bgScaleX = useTransform(clampedOverflow, (o) => {
    if (!barWidth) return 1;
    const extra = Math.abs(o);
    return extra > 0 ? (barWidth + extra + BG_EDGE_BUFFER) / barWidth : 1;
  });
  const bgX = useTransform(clampedOverflow, (o) => (o < 0 ? o - BG_EDGE_BUFFER : 0));

  // ── Sympathetic whole-bar stretch ──
  // A much smaller fraction of the already-clamped overflow, applied to
  // the bar itself (icons and all) — so the entire thing reads as one
  // piece of elastic material flexing together, not just the background
  // capsule moving independently behind static icons. Derived from the
  // already-clamped value, so it's automatically screen-safe too.
  const symOverflow = useTransform(clampedOverflow, (o) => {
    const v = o * SYMPATHETIC_FRACTION;
    return Math.max(-SYMPATHETIC_MAX_PX, Math.min(v, SYMPATHETIC_MAX_PX));
  });
  const symScaleX = useTransform(symOverflow, (o) => {
    if (!barWidth) return 1;
    const extra = Math.abs(o);
    return extra > 0 ? (barWidth + extra) / barWidth : 1;
  });
  const symX = useTransform(symOverflow, (o) => (o < 0 ? o : 0));

  const moveToCenter = useCallback((index, animated = true) => {
    if (!contentWidth) return;
    const cx = centerXFor(index);
    if (animated) animate(fingerX, cx, MOVE_SPRING);
    else fingerX.set(cx);
  }, [contentWidth, centerXFor, fingerX]);

  // Re-place (instantly) on measure/resize.
  useEffect(() => {
    if (!dragRef.current.dragging) moveToCenter(indexOf(active), false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentWidth, originOffset]);

  // Animate to the new tab's centre whenever the active tab changes for
  // any reason (click, scroll-spy) as long as we're not mid-drag — the
  // drag handler owns fingerX exclusively while dragging.
  const prevActiveRef = useRef(active);
  useEffect(() => {
    if (prevActiveRef.current !== active && !dragRef.current.dragging) {
      moveToCenter(indexOf(active), true);
    }
    prevActiveRef.current = active;
  }, [active, indexOf, moveToCenter]);

  const suppressSpyRef = useRef(false);
  const suppressTimeoutRef = useRef(null);
  const suppressSpyFor = useCallback((ms = SPY_SUPPRESS_MS) => {
    suppressSpyRef.current = true;
    if (suppressTimeoutRef.current) clearTimeout(suppressTimeoutRef.current);
    suppressTimeoutRef.current = setTimeout(() => { suppressSpyRef.current = false; }, ms);
  }, []);
  useEffect(() => () => { if (suppressTimeoutRef.current) clearTimeout(suppressTimeoutRef.current); }, []);

  const handleSpyActive = useCallback((key) => {
    if (suppressSpyRef.current) return;
    setActive(key);
  }, []);

  const handleTabClick = useCallback((key) => {
    suppressSpyFor();
    setActive(key);
  }, [suppressSpyFor]);

  const handlePointerDown = (e) => {
    dragRef.current = { dragging: true, startX: e.clientX, moved: false };
    tabWrapRef.current?.setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e) => {
    if (!dragRef.current.dragging || !slotWidth) return;
    if (Math.abs(e.clientX - dragRef.current.startX) > 6) dragRef.current.moved = true;
    if (!dragRef.current.moved) return;

    const wrap = tabWrapRef.current;
    if (!wrap) return;
    const wrapRect = wrap.getBoundingClientRect();
    const style = getComputedStyle(wrap);
    const borderLeft = parseFloat(style.borderLeftWidth) || 0;
    const fingerLocal = e.clientX - wrapRect.left - borderLeft;

    // Rubber-band resistance once the finger goes past the bar's own
    // content bounds — the pill's centre keeps moving but slower, capped
    // at whichever is smaller: MAX_FINGER_OVERSHOOT, or the real room left
    // on that side of the screen (measured in layout, above). The elastic
    // background and sympathetic whole-bar stretch are both derived from
    // this same fingerX value, so everything moves together and nothing
    // can ever push past the actual screen edge.
    const barMin = originOffset;
    const barMax = originOffset + contentWidth;
    const rightCap = Math.max(0, Math.min(MAX_FINGER_OVERSHOOT, rightSlack - BG_EDGE_BUFFER));
    const leftCap = Math.max(0, Math.min(MAX_FINGER_OVERSHOOT, leftSlack - BG_EDGE_BUFFER));
    let targetX = fingerLocal;
    if (fingerLocal > barMax) {
      targetX = barMax + Math.min((fingerLocal - barMax) * OVERSHOOT_RESISTANCE, rightCap);
    } else if (fingerLocal < barMin) {
      targetX = barMin - Math.min((barMin - fingerLocal) * OVERSHOOT_RESISTANCE, leftCap);
    }
    fingerX.set(targetX);

    const rawIndex = Math.floor((fingerLocal - originOffset) / slotWidth);
    const nearest = Math.max(0, Math.min(navItems.length - 1, rawIndex));
    const nearestKey = navItems[nearest].to;
    if (nearestKey !== activeRef.current) setActive(nearestKey);
  };

  const handlePointerUp = () => {
    if (!dragRef.current.dragging) return;
    const wasDrag = dragRef.current.moved;
    dragRef.current.dragging = false;
    if (wasDrag) {
      suppressSpyFor();
      // Spring the centre back onto the settled tab — clampedOverflow is
      // derived from fingerX, so the elastic edge and the sympathetic
      // whole-bar stretch both relax back to normal automatically as this
      // settles, no separate "snap back" needed.
      moveToCenter(indexOf(activeRef.current), true);
      scroller.scrollTo(activeRef.current, { smooth: true, duration: SCROLL_DURATION, offset: -40 });
    }
  };

  return (
    <>
      {/* Desktop floating glass pill nav */}
      <div className="ios-navbar-anchor">
        <motion.nav
          className={`ios-navbar${scrolled ? ' scrolled' : ''}`}
          initial={{ y: -60, opacity: 0 }}
          animate={{
            y: tucked ? 10 : 0,
            opacity: tucked ? 0.9 : 1,
            scale: tucked ? 0.92 : 1,
          }}
          transition={{ type: 'spring', stiffness: 300, damping: 28 }}
        >
          <span className="ios-navbar-logo">S<span className="dot" /></span>
          <ul className="ios-navbar-items">
            {navItems.map(({ label, to, Icon }) => (
              <li key={to}>
                <Link
                  to={to} smooth duration={SCROLL_DURATION} spy={!isMobile} offset={-90}
                  className="ios-nav-link"
                  activeClass="active"
                  onClick={() => handleTabClick(to)}
                  onSetActive={() => handleSpyActive(to)}
                >
                  <Icon />
                  <span>{label}</span>
                </Link>
              </li>
            ))}
          </ul>
          <a href={resumeUrl} target="_blank" rel="noreferrer" className="ios-navbar-cta">
            Resume
          </a>
        </motion.nav>
      </div>

      {/* Mobile floating "Liquid Glass" pill nav */}
      <motion.nav
        className="ios-tabbar"
        animate={{
          y: tucked ? 20 : 0,
          opacity: tucked ? 0.88 : 1,
          scale: tucked ? 0.94 : 1,
        }}
        transition={{ type: 'spring', stiffness: 300, damping: 28 }}
      >
        <motion.div
          className="ios-tabbar-inner"
          ref={tabWrapRef}
          style={{ x: symX, scaleX: symScaleX }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {barWidth > 0 && (
            <motion.div
              className="tabbar-elastic-bg"
              style={{ x: bgX, scaleX: bgScaleX }}
            />
          )}

          {contentWidth > 0 && (
            <motion.span
              className="tab-pill"
              style={{ x: pillX, scaleX: pillScaleX, width: baseWidth }}
            />
          )}

          {navItems.map(({ label, to, Icon }) => {
            const isActive = active === to;
            return (
              <div key={to} className="ios-tab-slot">
                <Link
                  to={to} smooth duration={SCROLL_DURATION} spy={isMobile} offset={-40}
                  className={`ios-tab-item${isActive ? ' tab-active' : ''}`}
                  onClick={() => handleTabClick(to)}
                  onSetActive={() => handleSpyActive(to)}
                  aria-label={label}
                >
                  <Icon className="ios-tab-icon" />
                </Link>
              </div>
            );
          })}
        </motion.div>
      </motion.nav>
    </>
  );
}