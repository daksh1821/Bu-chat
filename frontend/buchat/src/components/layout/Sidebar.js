import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Home,
  TrendingUp, // Popular
  MessageSquare, // Answers
  Compass, // Explore
  Globe, // All
  ChevronDown,
  Plus,
  Settings,
  History, // For Recent
  BookText, // For Resources
  Megaphone, // For Advertise
  Code, // For Developer Platform
  HelpCircle, // For Help
  Briefcase, // For Careers
  FileText, // For Blog/Press
} from 'lucide-react';
// import { useAuth } from '../../contexts/AuthContext'; // Removed AuthContext
import './Sidebar.css';

// A mock list to show how joined communities will look.
// You will replace this with real data.
// const mockJoinedCommunities = [
//   { name: 'r/announcements', path: '/r/announcements', icon: 'https://placehold.co/24x24/FF4500/FFF?text=A' },
//   { name: 'r/aww', path: '/r/aww', icon: 'https://placehold.co/24x24/54A0FF/FFF?text=A' },
//   { name: 'r/CarsIndia', path: '/r/CarsIndia', icon: 'https://placehold.co/24x24/00D2D3/FFF?text=C' },
// ];

// Mock list for "Recent"
// const mockRecentCommunities = [
//   { name: 'r/technology', path: '/r/technology', icon: 'https://placehold.co/24x24/2196F3/FFF?text=T' },
//   { name: 'r/NaughtyIndians', path: '/r/NaughtyIndians', icon: 'https://placehold.co/24x24/E91E63/FFF?text=N' },
// ];

// List for "Resources"
const resourcesNavItems = [
  { icon: BookText, label: 'About BuChat', path: '/about' },
  { icon: Megaphone, label: 'Advertise', path: '/advertise' },
  { icon: Code, label: 'Developer Platform', path: '/developers' },
  { icon: HelpCircle, label: 'Help', path: '/help' },
  { icon: FileText, label: 'Blog', path: '/blog' },
  { icon: Briefcase, label: 'Careers', path: '/careers' },
];

const Sidebar = ({ isOpen, onClose }) => {
  const location = useLocation();
  // const { isAuthenticated, user } = useAuth(); // Removed AuthContext
  const [isRecentOpen, setIsRecentOpen] = useState(true);
  const [isCommunitiesOpen, setIsCommunitiesOpen] = useState(true);
  const [isResourcesOpen, setIsResourcesOpen] = useState(true);

  // Main navigation items from the image
  const mainNavItems = [
    { icon: Home, label: 'Home', path: '/' },
    { icon: TrendingUp, label: 'Popular', path: '/popular' },
    { icon: MessageSquare, label: 'Answers', path: '/answers' },
    { icon: Compass, label: 'Explore', path: '/explore' },
    { icon: Globe, label: 'All', path: '/all' },
  ];

  const isActive = (path) => {
    // Make 'Home' active only on the exact path
    if (path === '/') {
      return location.pathname === '/';
    }
    // For other paths, check if the pathname starts with it
    return location.pathname.startsWith(path);
  };

  const listVariants = {
    hidden: { opacity: 0, height: 0 },
    visible: { opacity: 1, height: 'auto', transition: { duration: 0.3 } },
  };

  return (
    <>
      {/* Overlay for mobile view */}
      {isOpen && <div className="sidebar-overlay" onClick={onClose}></div>}

      {/* Sidebar container */}
      <motion.aside
        className={`sidebar ${isOpen ? 'open' : ''}`}
        initial={{ x: '-100%' }}
        animate={{ x: isOpen ? 0 : '-100%' }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      >
        <div className="sidebar-content">
          {/* Main Navigation */}
          <nav className="sidebar-nav">
            {mainNavItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`sidebar-item ${isActive(item.path) ? 'active' : ''}`}
                onClick={onClose}
              >
                <item.icon size={24} />
                <span>{item.label}</span>
              </Link>
            ))}
          </nav>

          <hr className="sidebar-divider" />

          {/* --- RECENT Section --- */}
          <div className="sidebar-section">
            <button
              className={`sidebar-section-header ${isRecentOpen ? 'open' : ''}`}
              onClick={() => setIsRecentOpen(!isRecentOpen)}
            >
              <span>Recent</span>
              <ChevronDown size={20} className="chevron-icon" />
            </button>

            <AnimatePresence>
              {isRecentOpen && (
                <motion.div
                  className="community-list"
                  variants={listVariants}
                  initial="hidden"
                  animate="visible"
                  exit="hidden"
                >
                  {/* Items removed as requested */}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <hr className="sidebar-divider" />

          {/* --- COMMUNITIES Section --- */}
          <div className="sidebar-section">
            <button
              className={`sidebar-section-header ${isCommunitiesOpen ? 'open' : ''}`}
              onClick={() => setIsCommunitiesOpen(!isCommunitiesOpen)}
            >
              <span>Communities</span>
              <ChevronDown size={20} className="chevron-icon" />
            </button>

            <AnimatePresence>
              {isCommunitiesOpen && (
                <motion.div
                  className="community-list"
                  variants={listVariants}
                  initial="hidden"
                  animate="visible"
                  exit="hidden"
                >
                  {/* Items removed as requested */}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <hr className="sidebar-divider" />

          {/* --- RESOURCES Section --- */}
          <div className="sidebar-section">
            <button
              className={`sidebar-section-header ${isResourcesOpen ? 'open' : ''}`}
              onClick={() => setIsResourcesOpen(!isResourcesOpen)}
            >
              <span>Resources</span>
              <ChevronDown size={20} className="chevron-icon" />
            </button>

            <AnimatePresence>
              {isResourcesOpen && (
                <motion.div
                  className="community-list" // Reusing community-list style
                  variants={listVariants}
                  initial="hidden"
                  animate="visible"
                  exit="hidden"
                >
                  {resourcesNavItems.map((item) => (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={`community-item ${isActive(item.path) ? 'active' : ''}`} // Reusing community-item style
                      onClick={onClose}
                    >
                      <item.icon size={24} className="community-icon-placeholder" />
                      <span>{item.label}</span>
                    </Link>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

        </div>
      </motion.aside>
    </>
  );
};

export default Sidebar;