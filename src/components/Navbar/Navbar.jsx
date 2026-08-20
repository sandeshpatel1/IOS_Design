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
// (rubber band), slow/stopped = relaxed back to a normal circle.
const STRETCH_VELOCITY_FACTOR = 0.11; // extra px of pill width per px/s of centre speed
const MAX_STRETCH_SLOTS = 1.6;        // cap stretch at ~1.6 tab-slots of extra width
const VELOCITY_SPRING = { stiffness: 180, damping: 22, mass: 0.55 }; // "rubberiness" of the pill's own snap-back

// ── Elastic navbar edges (new) ──
// Dragging the finger past the bar's own bounds now has resistance instead
// of following 1:1 — the classic rubber-band pull. The background layer
// (`.tabbar-elastic-bg`) is a separate element behind the icons whose width
// is derived every frame from wherever the pill currently is, so it always
// grows just enough on whichever side the pill is pushing toward and never
// lets the pill get visually cut off, then relaxes back the instant the
// pill is back inside the resting bounds.
const OVERSHOOT_RESISTANCE = 0.45; // 0..1 — lower = more resistance pulling the finger
const MAX_FINGER_OVERSHOOT = 30;   // px the pill's centre can be dragged past the bar's edge
const BG_EDGE_BUFFER = 6;          // px slack so the bg's rounded corner always clears the pill's

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

  const [layout, setLayout] = useState({ contentWidth: 0, originOffset: 0, barWidth: 0 });

  useLayoutEffect(() => {
    const wrap = tabWrapRef.current;
    if (!wrap) return;
    const measure = () => {
      const style = getComputedStyle(wrap);
      const paddingLeft = parseFloat(style.paddingLeft) || 0;
      const paddingRight = parseFloat(style.paddingRight) || 0;
      setLayout({
        contentWidth: wrap.clientWidth - paddingLeft - paddingRight,
        originOffset: paddingLeft,
        barWidth: wrap.getBoundingClientRect().width,
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  const { contentWidth, originOffset, barWidth } = layout;
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

  const pillStretch = useTransform(smoothVelocity, (v) => {
    const maxStretch = slotWidth * MAX_STRETCH_SLOTS;
    if (!maxStretch) return 0;
    return Math.min(Math.abs(v) * STRETCH_VELOCITY_FACTOR, maxStretch);
  });

  // scaleX (a transform) instead of animating `width` directly — keeps the
  // stretch effect fully GPU-compositable instead of triggering layout on
  // every frame of the drag.
  const pillScaleX = useTransform(pillStretch, (extra) => (
    baseWidth ? (baseWidth + extra) / baseWidth : 1
  ));
  const pillX = useTransform(fingerX, (cx) => cx - baseWidth / 2);

  // ── Elastic background derivation ──
  // Purely a function of where the pill's edges currently are relative to
  // the bar's resting content bounds — no separate state to keep in sync.
  // Positive = pill pushing past the right bound, negative = past the left.
  const bgOverflow = useTransform([fingerX, pillStretch], ([cx, extra]) => {
    const half = (baseWidth + extra) / 2;
    const rightEdge = cx + half;
    const leftEdge = cx - half;
    const barMin = originOffset;
    const barMax = originOffset + contentWidth;
    const overRight = Math.max(0, rightEdge - barMax);
    const overLeft = Math.max(0, barMin - leftEdge);
    return overRight >= overLeft ? overRight : -overLeft;
  });

  // Fixed transform-origin at the left edge for both directions — growing
  // right is a plain scale from x:0; growing left is the same scale plus a
  // compensating negative x so the RIGHT edge stays anchored instead.
  const bgScaleX = useTransform(bgOverflow, (o) => {
    if (!barWidth) return 1;
    const extra = Math.abs(o);
    return extra > 0 ? (barWidth + extra + BG_EDGE_BUFFER) / barWidth : 1;
  });
  const bgX = useTransform(bgOverflow, (o) => (o < 0 ? o - BG_EDGE_BUFFER : 0));

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
    // at MAX_FINGER_OVERSHOOT, instead of tracking the raw finger 1:1. The
    // elastic background (bgOverflow, above) reacts automatically to this
    // same fingerX value, so the two always move together.
    const barMin = originOffset;
    const barMax = originOffset + contentWidth;
    let targetX = fingerLocal;
    if (fingerLocal > barMax) {
      targetX = barMax + Math.min((fingerLocal - barMax) * OVERSHOOT_RESISTANCE, MAX_FINGER_OVERSHOOT);
    } else if (fingerLocal < barMin) {
      targetX = barMin - Math.min((barMin - fingerLocal) * OVERSHOOT_RESISTANCE, MAX_FINGER_OVERSHOOT);
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
      // Spring the centre back onto the settled tab — bgOverflow is
      // derived from fingerX, so the elastic edge relaxes back to normal
      // automatically as this settles, no separate "snap back" needed.
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
        <div
          className="ios-tabbar-inner"
          ref={tabWrapRef}
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
        </div>
      </motion.nav>
    </>
  );
}