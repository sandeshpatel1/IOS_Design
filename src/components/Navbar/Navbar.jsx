import { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import { Link, scroller } from 'react-scroll';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
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

// ── Stretch tuning ──
const DEAD_ZONE = 10;      // px the finger must cross past a slot boundary
                            // before the anchor re-targets to the next tab —
                            // without this, sitting near a boundary makes
                            // the anchor flicker back and forth every frame.
const MAX_STRETCH_RATIO = 1; // stretch caps at 1x a slot-width beyond the
                              // anchor's own edge, so the pill can't smear
                              // across the whole bar on a fast/long drag.

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
  const anchorIndexRef = useRef(0); // which tab's edge is currently "pinned"

  const [layout, setLayout] = useState({ contentWidth: 0, originOffset: 0 });

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
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  const { contentWidth, originOffset } = layout;
  const slotWidth = contentWidth / navItems.length;

  const indexOf = useCallback((key) => {
    const i = navItems.findIndex(t => t.to === key);
    return i === -1 ? 0 : i;
  }, []);

  // Two independent edges instead of one x + fixed width — a stretch needs
  // two points that can move apart from each other. Width is derived, not
  // stored, so it's always mathematically consistent with the edges.
  const leftEdge = useMotionValue(0);
  const rightEdge = useMotionValue(64);
  const pillWidth = useTransform([leftEdge, rightEdge], ([l, r]) => Math.max(r - l, 0));

  const slotBounds = useCallback((index) => ({
    left: originOffset + index * slotWidth + PILL_INSET,
    right: originOffset + (index + 1) * slotWidth - PILL_INSET,
  }), [originOffset, slotWidth]);

  const moveToIndex = useCallback((index, animated = true) => {
    if (!slotWidth) return;
    const { left, right } = slotBounds(index);
    if (animated) {
      animate(leftEdge, left, MOVE_SPRING);
      animate(rightEdge, right, MOVE_SPRING);
    } else {
      leftEdge.set(left);
      rightEdge.set(right);
    }
  }, [slotWidth, slotBounds, leftEdge, rightEdge]);

  useEffect(() => {
    anchorIndexRef.current = indexOf(active);
    if (!dragRef.current.dragging) moveToIndex(indexOf(active), false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentWidth, originOffset]);

  const prevActiveRef = useRef(active);
  useEffect(() => {
    anchorIndexRef.current = indexOf(active);
    if (prevActiveRef.current !== active && !dragRef.current.dragging) {
      moveToIndex(indexOf(active), true);
    }
    prevActiveRef.current = active;
  }, [active, indexOf, moveToIndex]);

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
    anchorIndexRef.current = indexOf(key);
    setActive(key);
  }, [suppressSpyFor, indexOf]);

  const handlePointerDown = (e) => {
    anchorIndexRef.current = indexOf(active);
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
    const fingerClamped = Math.max(originOffset, Math.min(fingerLocal, originOffset + contentWidth));

    // ── Anchor with hysteresis: only re-target the pinned tab once the
    // finger has crossed DEAD_ZONE px past the boundary, so sitting near
    // an edge doesn't make the anchor (and the whole stretch) flicker. ──
    const anchorIndex = anchorIndexRef.current;
    const anchorCenter = originOffset + anchorIndex * slotWidth + slotWidth / 2;
    if (fingerClamped > anchorCenter && anchorIndex < navItems.length - 1) {
      const boundary = originOffset + (anchorIndex + 1) * slotWidth;
      if (fingerClamped > boundary + DEAD_ZONE) anchorIndexRef.current = anchorIndex + 1;
    } else if (fingerClamped < anchorCenter && anchorIndex > 0) {
      const boundary = originOffset + anchorIndex * slotWidth;
      if (fingerClamped < boundary - DEAD_ZONE) anchorIndexRef.current = anchorIndex - 1;
    }

    const settledIndex = anchorIndexRef.current;
    const settledKey = navItems[settledIndex].to;
    if (settledKey !== active) setActive(settledKey);

    // ── Stretch: pin the edge behind the finger to the anchor tab's own
    // slot edge; let the edge in front chase the finger, capped at one
    // extra slot-width so it can never smear across the whole bar. ──
    const { left: anchorLeft, right: anchorRight } = slotBounds(settledIndex);
    const maxStretch = slotWidth * MAX_STRETCH_RATIO;
    const barMinX = originOffset + PILL_INSET;
    const barMaxX = originOffset + contentWidth - PILL_INSET;

    if (fingerClamped >= (anchorLeft + anchorRight) / 2) {
      leftEdge.set(anchorLeft);
      const stretched = Math.max(anchorRight, Math.min(fingerClamped, anchorRight + maxStretch));
      rightEdge.set(Math.min(stretched, barMaxX));
    } else {
      rightEdge.set(anchorRight);
      const stretched = Math.min(anchorLeft, Math.max(fingerClamped, anchorLeft - maxStretch));
      leftEdge.set(Math.max(stretched, barMinX));
    }
  };

  const handlePointerUp = () => {
    if (!dragRef.current.dragging) return;
    const wasDrag = dragRef.current.moved;
    dragRef.current.dragging = false;
    if (wasDrag) {
      suppressSpyFor();
      moveToIndex(anchorIndexRef.current, true); // snap the stretch back to a clean pill
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
          {contentWidth > 0 && (
            <motion.span
              className="tab-pill"
              style={{ x: leftEdge, width: pillWidth }}
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