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
const SCROLL_DURATION = 500;
const SPY_SUPPRESS_MS = SCROLL_DURATION + 200;
const PILL_INSET = 4; // px gap between pill edge and slot edge, each side

export default function Navbar({ config }) {
  const [active, setActive] = useState('home');
  const resumeUrl = config?.resumeUrl || '#';
  const { direction, scrolled } = useScrollDirection();
  const tucked = scrolled && direction === 'down';

  const tabWrapRef = useRef(null);
  const [wrapWidth, setWrapWidth] = useState(0);
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

  // ── Geometry is pure arithmetic now, not live DOM measurement of each
  // tab. All 5 slots are equal width (flex:1 in CSS), so once we know the
  // bar's own width we know every slot's position exactly — no more
  // getBoundingClientRect() calls on the icons themselves, which is what
  // was racing with the navbar's own scale/opacity spring (the `tucked`
  // animation) and occasionally returning a mid-transition rect: a wrong
  // position, or a momentarily huge/zero width that looked like "the
  // layout breaking". ──
  const slotWidth = wrapWidth / navItems.length;
  const pillW = Math.max(slotWidth - PILL_INSET * 2, 0);

  const indexOf = useCallback((key) => {
    const i = navItems.findIndex(t => t.to === key);
    return i === -1 ? 0 : i;
  }, []);

  const moveToIndex = useCallback((index, animated = true) => {
    if (!slotWidth) return;
    pillWidth.set(pillW);
    const x = index * slotWidth + PILL_INSET;
    if (animated) animate(pillX, x, MOVE_SPRING);
    else pillX.set(x);
  }, [slotWidth, pillW, pillX, pillWidth]);

  // Measure the bar's own width — once on mount, and whenever it resizes
  // (viewport resize, orientation change, safe-area changes).
  useLayoutEffect(() => {
    const wrap = tabWrapRef.current;
    if (!wrap) return;
    const measure = () => setWrapWidth(wrap.getBoundingClientRect().width);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  // Re-snap to the current tab whenever the measured width changes,
  // as long as we're not mid-drag.
  useEffect(() => {
    if (!dragRef.current.dragging) moveToIndex(indexOf(active), false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wrapWidth]);

  // Tap / scroll-spy driven changes glide over with the spring.
  const prevActiveRef = useRef(active);
  useEffect(() => {
    if (prevActiveRef.current !== active && !dragRef.current.dragging) {
      moveToIndex(indexOf(active), true);
    }
    prevActiveRef.current = active;
  }, [active, indexOf, moveToIndex]);

  // Scroll-spy from organic scrolling — ignored while WE are driving a
  // scroll ourselves (click or drag release). A programmatic scroll to
  // "Contact" passes through Skills/Work on the way there, and spy fires
  // onSetActive for each section it passes, not just the destination —
  // that's what was yanking the pill to the wrong tab on release.
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
    const fingerX = e.clientX - wrapRect.left;

    const clampedLeft = Math.max(
      PILL_INSET,
      Math.min(fingerX - pillW / 2, wrapWidth - pillW - PILL_INSET)
    );
    pillWidth.set(pillW); // always the constant slot width — never derived
                          // from a per-tab measurement, so it can't glitch
    pillX.set(clampedLeft);

    const centerX = clampedLeft + pillW / 2;
    const nearestIndex = Math.max(0, Math.min(Math.floor(centerX / slotWidth), navItems.length - 1));
    const nearestKey = navItems[nearestIndex].to;
    if (nearestKey !== active) setActive(nearestKey);
  };

  const handlePointerUp = () => {
    if (!dragRef.current.dragging) return;
    const wasDrag = dragRef.current.moved;
    dragRef.current.dragging = false;
    if (wasDrag) {
      suppressSpyFor();
      moveToIndex(indexOf(active), true);
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
          {wrapWidth > 0 && (
            <motion.span
              className="tab-pill"
              style={{ x: pillX, width: pillWidth }}
            />
          )}

          {navItems.map(({ label, to, Icon }) => {
            const isActive = active === to;
            return (
              <div key={to} className="ios-tab-slot">
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