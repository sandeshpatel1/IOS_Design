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

// Apple's "move / reposition" spring: critically damped, no bounce —
// see apple-design skill, section 4.
const MOVE_SPRING = { type: 'spring', damping: 30, stiffness: 340 };

export default function Navbar({ config }) {
  const [active, setActive] = useState('home');
  const resumeUrl = config?.resumeUrl || '#';
  const { direction, scrolled } = useScrollDirection();
  const tucked = scrolled && direction === 'down';

  const tabWrapRef = useRef(null);
  const tabItemRefs = useRef({});
  const dragRef = useRef({ dragging: false, startX: 0, moved: false });

  // Both driven as motion values so Framer Motion updates the DOM directly
  // (no React re-render needed) — GPU-compositable `transform: translateX()`
  // for position, NOT `left`, which forces layout every frame and is
  // exactly what was causing the stutter (apple-design skill §11).
  const pillX = useMotionValue(0);
  const pillWidth = useMotionValue(64);

  const getSlotCenter = useCallback((key) => {
    const wrap = tabWrapRef.current;
    const el = tabItemRefs.current[key];
    if (!wrap || !el) return null;
    const wrapRect = wrap.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    pillWidth.set(r.width - 10); // slot width minus a hair of margin
    return r.left - wrapRect.left + r.width / 2;
  }, [pillWidth]);

  const moveTo = useCallback((key, animated = true) => {
    const center = getSlotCenter(key);
    if (center == null) return;
    const target = center - pillWidth.get() / 2;
    if (animated) animate(pillX, target, MOVE_SPRING);
    else pillX.set(target);
  }, [getSlotCenter, pillX, pillWidth]);

  // Position on mount, keep glued to its tab on resize/orientation change.
  useLayoutEffect(() => {
    moveTo(active, false);
    const onResize = () => moveTo(active, false);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Safety net: re-measure a frame after mount in case fonts were still
  // settling when the first layout pass ran.
  useEffect(() => {
    const id = requestAnimationFrame(() => moveTo(active, false));
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tap / scroll-spy driven changes glide over with the spring.
  const prevActiveRef = useRef(active);
  useEffect(() => {
    if (prevActiveRef.current !== active && !dragRef.current.dragging) {
      moveTo(active, true);
    }
    prevActiveRef.current = active;
  }, [active, moveTo]);

  // ── Drag-to-follow: 1:1 tracking while the finger is down (apple-design
  //    skill §2 — direct manipulation), snaps to the nearest tab on release. ──
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
    pillX.set(clamped); // no animation — glued to the finger every frame

    const fingerCenter = clamped + halfPill;
    let nearestKey = active, nearestDist = Infinity;
    navItems.forEach(t => {
      const c = getSlotCenter(t.to);
      if (c == null) return;
      const d = Math.abs(c - fingerCenter);
      if (d < nearestDist) { nearestDist = d; nearestKey = t.to; }
    });
    if (nearestKey !== active) setActive(nearestKey);
  };

  const handlePointerUp = () => {
    if (!dragRef.current.dragging) return;
    const wasDrag = dragRef.current.moved;
    dragRef.current.dragging = false;
    if (wasDrag) {
      moveTo(active, true);
      setActive(active);
      scroller.scrollTo(active, { smooth: true, duration: 500, offset: -40 });
    }
  };

  return (
    <>
      {/* Desktop floating glass pill — shrinks & dips on scroll-down, restores on scroll-up */}
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
                  to={to} smooth duration={500} spy offset={-90}
                  className="ios-nav-link"
                  activeClass="active"
                  onClick={() => setActive(to)}
                  onSetActive={() => setActive(to)}
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

      {/* Mobile floating "Liquid Glass" pill nav — Instagram-style translate-only slide */}
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
                  to={to} smooth duration={500} spy offset={-40}
                  className={`ios-tab-item${isActive ? ' tab-active' : ''}`}
                  onClick={() => setActive(to)}
                  onSetActive={() => setActive(to)}
                >
                  <span className="ios-tab-icon-wrap">
                    <Icon className="ios-tab-icon" />
                  </span>
                  <span className="ios-tab-label">{label}</span>
                </Link>
              </div>
            );
          })}
        </div>
      </motion.nav>
    </>
  );
}
