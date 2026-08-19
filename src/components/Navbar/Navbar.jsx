import { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import { Link, scroller } from 'react-scroll';
import { motion, useMotionValue, animate } from 'framer-motion';
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

const MOVE_SPRING = { type: 'spring', damping: 30, stiffness: 340 };

// How long react-scroll's own smooth-scroll animation takes. We mute its
// `spy` callback for this long after WE trigger a scroll (click or drag
// release), because spy fires for every section the viewport passes
// THROUGH en route to the target, not just the destination. Without this,
// scrolling to "Contact" passes Skills/Work, spy fires onSetActive for
// each of them mid-flight, and the pill jumps to whichever fired last —
// this is the actual cause of the "wrong tab" bug.
const SCROLL_DURATION = 500;
const SPY_SUPPRESS_MS = SCROLL_DURATION + 150;

export default function Navbar({ config }) {
  const [active, setActive] = useState('home');
  const resumeUrl = config?.resumeUrl || '#';
  const { direction, scrolled } = useScrollDirection();
  const tucked = scrolled && direction === 'down';

  const tabWrapRef = useRef(null);
  const tabItemRefs = useRef({});
  const dragRef = useRef({ dragging: false, startX: 0, moved: false });

  const suppressSpyRef = useRef(false);
  const suppressTimeoutRef = useRef(null);
  const suppressSpyFor = useCallback((ms = SPY_SUPPRESS_MS) => {
    suppressSpyRef.current = true;
    if (suppressTimeoutRef.current) clearTimeout(suppressTimeoutRef.current);
    suppressTimeoutRef.current = setTimeout(() => { suppressSpyRef.current = false; }, ms);
  }, []);
  useEffect(() => () => { if (suppressTimeoutRef.current) clearTimeout(suppressTimeoutRef.current); }, []);

  const pillX = useMotionValue(0);
  const pillWidth = useMotionValue(64);

  // Pure measurement, no side effects — the nearest-tab search during a
  // drag can call this for every candidate without corrupting pillWidth.
  const measureSlot = useCallback((key) => {
    const wrap = tabWrapRef.current;
    const el = tabItemRefs.current[key];
    if (!wrap || !el) return null;
    const wrapRect = wrap.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return {
      center: r.left - wrapRect.left + r.width / 2,
      width: r.width - 4, // near-edge-to-edge fill, Instagram-style
    };
  }, []);

  const moveTo = useCallback((key, animated = true) => {
    const slot = measureSlot(key);
    if (!slot) return;
    pillWidth.set(slot.width);
    const target = slot.center - slot.width / 2;
    if (animated) animate(pillX, target, MOVE_SPRING);
    else pillX.set(target);
  }, [measureSlot, pillX, pillWidth]);

  useLayoutEffect(() => {
    moveTo(active, false);
    const onResize = () => moveTo(active, false);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const id = requestAnimationFrame(() => moveTo(active, false));
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const prevActiveRef = useRef(active);
  useEffect(() => {
    if (prevActiveRef.current !== active && !dragRef.current.dragging) {
      moveTo(active, true);
    }
    prevActiveRef.current = active;
  }, [active, moveTo]);

  // Scroll-spy updates from organic scrolling — ignored while WE are the
  // ones driving a scroll (click or drag release).
  const handleSpyActive = useCallback((key) => {
    if (suppressSpyRef.current) return;
    setActive(key);
  }, []);

  // Direct tab click — the Link performs its own smooth scroll; we just
  // mute spy for that scroll's duration so it can't hijack the pill.
  const handleTabClick = useCallback((key) => {
    suppressSpyFor();
    setActive(key);
  }, [suppressSpyFor]);

  const handlePointerDown = (e) => {
    dragRef.current = { dragging: true, startX: e.clientX, moved: false };
    tabWrapRef.current?.setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e) => {
    if (!dragRef.current.dragging) return;
    if (Math.abs(e.clientX - dragRef.current.startX) > 6) dragRef.current.moved = true;
    if (!dragRef.current.moved) return;

    const wrap = tabWrapRef.current;
    if (!wrap) return;
    const wrapRect = wrap.getBoundingClientRect();
    const halfPill = pillWidth.get() / 2;
    const clamped = Math.max(4, Math.min(e.clientX - wrapRect.left - halfPill, wrapRect.width - pillWidth.get() - 4));
    pillX.set(clamped);

    const fingerCenter = clamped + halfPill;
    let nearestKey = active, nearestDist = Infinity;
    navItems.forEach(t => {
      const slot = measureSlot(t.to); // read-only — doesn't touch pillWidth
      if (!slot) return;
      const d = Math.abs(slot.center - fingerCenter);
      if (d < nearestDist) { nearestDist = d; nearestKey = t.to; }
    });
    if (nearestKey !== active) setActive(nearestKey);
  };

  const handlePointerUp = () => {
    if (!dragRef.current.dragging) return;
    const wasDrag = dragRef.current.moved;
    dragRef.current.dragging = false;
    if (wasDrag) {
      suppressSpyFor(); // the programmatic scroll below passes through
                         // intermediate sections — don't let spy hijack it
      moveTo(active, true);
      scroller.scrollTo(active, { smooth: true, duration: SCROLL_DURATION, offset: -40 });
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
                  to={to} smooth duration={SCROLL_DURATION} spy offset={-90}
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
          <motion.span
            className="tab-pill"
            style={{ x: pillX, width: pillWidth }}
          />

          {navItems.map(({ label, to, Icon }) => {
            const isActive = active === to;
            return (
              <div key={to} className="ios-tab-slot" ref={el => { tabItemRefs.current[to] = el; }}>
                <Link
                  to={to} smooth duration={SCROLL_DURATION} spy offset={-40}
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