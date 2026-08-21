import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { HiXMark, HiArrowUpRight } from 'react-icons/hi2';
import { FaGithub, FaStar, FaCodeBranch } from 'react-icons/fa';
import BrowserFrame from '../BrowserFrame/BrowserFrame';
import './ProjectDetail.css';

function initials(name) {
  return (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function siteUrl(project) {
  if (project.demo) {
    try { return new URL(project.demo).hostname.replace('www.', ''); } catch { /* fall through */ }
  }
  return `${(project.title || project.name || 'project').toLowerCase().replace(/[^a-z0-9]+/g, '')}.dev`;
}

/* The morph destination. `layoutId` matches whichever card (featured or
   list row) the visitor tapped — Framer Motion handles the FLIP animation
   between that card's icon and this one automatically; everything else
   here just fades/slides in a beat after, staggered, so the icon reads as
   the one continuous element and the rest of the page "arrives" around it
   (apple-design: materialize, don't just fade — and anchor to source). */
export default function ProjectDetail({ project, layoutId, onClose }) {
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prevOverflow; };
  }, []);

  const color = project.color || '#0a84ff';
  const tags = project.tags || [];
  const hasStats = project.stars !== undefined;
  const title = project.title || project.name;

  return (
    <motion.div
      className="detail-stage"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.28 }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${title} details`}
    >
      <motion.div
        className="detail-panel glass-strong"
        style={{ '--card-color': color }}
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.97 }}
        transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="detail-close" onClick={onClose} aria-label="Close">
          <HiXMark />
        </button>

        <div className="detail-head">
          <motion.div
            className="detail-icon"
            style={{ background: color }}
            layoutId={layoutId}
            transition={{ type: 'spring', bounce: 0, duration: 0.45 }}
          >
            {initials(title)}
          </motion.div>
          <motion.div
            className="detail-head-text"
            initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1, duration: 0.35 }}
          >
            <h3 className="detail-title">{title}</h3>
            {hasStats && (
              <div className="detail-stats">
                <span><FaStar /> {project.stars}</span>
                <span><FaCodeBranch /> {project.forks}</span>
              </div>
            )}
          </motion.div>
        </div>

        <motion.p className="detail-desc"
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.14, duration: 0.35 }}>
          {project.desc || project.description || 'No description available.'}
        </motion.p>

        {tags.length > 0 && (
          <motion.div className="detail-tags"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            transition={{ delay: 0.18, duration: 0.35 }}>
            {tags.map(t => <span key={t} className="detail-tag">{t}</span>)}
          </motion.div>
        )}

        <motion.div className="detail-preview"
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.22, duration: 0.4 }}>
          <BrowserFrame url={siteUrl(project)}>
            {project.demo ? (
              // The real, live project — not a screenshot. Loads lazily since
              // it's only ever mounted once someone actually opens this card.
              <iframe
                src={project.demo}
                title={`${title} live preview`}
                className="detail-iframe"
                loading="lazy"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              />
            ) : (
              <div className="detail-preview-fallback" style={{ background: `linear-gradient(155deg, ${color}22, #05070d 120%)` }}>
                <span style={{ color }}>{initials(title)}</span>
              </div>
            )}
          </BrowserFrame>
          {project.demo && (
            <p className="detail-preview-note">
              Live embed — some sites restrict embedding.{' '}
              <a href={project.demo} target="_blank" rel="noreferrer">Open it directly ↗</a> if it looks blank.
            </p>
          )}
        </motion.div>

        <motion.div className="detail-actions"
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.26, duration: 0.35 }}>
          {project.demo && (
            <a href={project.demo} target="_blank" rel="noreferrer" className="ios-btn ios-btn-primary">
              Open Live <HiArrowUpRight />
            </a>
          )}
          {project.github && (
            <a href={project.github} target="_blank" rel="noreferrer" className="ios-btn ios-btn-glass">
              <FaGithub /> View Code
            </a>
          )}
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
