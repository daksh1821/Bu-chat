import React, { useState, useEffect, useCallback } from 'react'; // Import useCallback
import { Link, useLocation, useNavigate } from 'react-router-dom'; // Import useNavigate
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
import { useAuth } from '../../contexts/AuthContext';
import { communityService } from '../../services/communityService';
import CommunityModal from '../community/CreateCommunityModal'; // Import the modal
import './Sidebar.css';

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
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate(); // Initialize navigate
  const [isRecentOpen, setIsRecentOpen] = useState(true);
  const [isCommunitiesOpen, setIsCommunitiesOpen] = useState(true);
  const [isResourcesOpen, setIsResourcesOpen] = useState(true);

  const [joinedCommunities, setJoinedCommunities] = useState([]);
  const [loadingCommunities, setLoadingCommunities] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false); // State for modal

  // --- NEW: Wrapped fetchJoined in useCallback ---
  // This allows it to be called from useEffect AND handleCommunityCreated
  const fetchJoined = useCallback(async () => {
    if (isAuthenticated && user) {
      setLoadingCommunities(true);
      try {
        const response = await communityService.getJoinedCommunities(user.userId || user.id);
        setJoinedCommunities(response.communities || []);
      } catch (error) {
        console.error('Failed to fetch joined communities:', error);
        setJoinedCommunities([]);
      } finally {
        setLoadingCommunities(false);
      }
    } else {
      setJoinedCommunities([]);
    }
  }, [isAuthenticated, user]);

  useEffect(() => {
    fetchJoined();
  }, [fetchJoined]); // useEffect now depends on the stable useCallback function

  // --- NEW: Handler for when the modal successfully creates a community ---
  const handleCommunityCreated = (communityName) => {
    setIsModalOpen(false); // Close the modal
    fetchJoined(); // Re-fetch the list of communities
    onClose(); // Close the sidebar (for mobile)
    navigate(`/c/${communityName}`); // Navigate to the new community page
  };

  // Main navigation items from the image
  const mainNavItems = [
    { icon: Home, label: 'Home', path: '/' },
    { icon: TrendingUp, label: 'Popular', path: '/popular' },
    { icon: MessageSquare, label: 'Answers', path: '/answers' },
    { icon: Compass, label: 'Explore', path: '/explore' },
    { icon: Globe, label: 'All', path: '/all' },
  ];

  const isActive = (path) => {
    if (path === '/') {
      return location.pathname === '/';
    }
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

          {/* --- COMMUNITIES Section (UPDATED) --- */}
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
                  {/* --- NEW DYNAMIC CONTENT --- */}
                  {isAuthenticated ? (
                    <>
                      {/* --- UPDATED: This is now a button to open the modal --- */}
                      <button 
                        className="community-item" 
                        onClick={() => {
                          setIsModalOpen(true);
                          onClose(); // Close sidebar if on mobile
                        }}
                      >
                        <Plus size={24} className="community-icon-placeholder" />
                        <span>Create Community</span>
                      </button>
                      
                      {loadingCommunities && (
                        <div className="community-item-loading">
                          <span>Loading communities...</span>
                        </div>
                      )}

                      {!loadingCommunities && joinedCommunities.length > 0 && (
                        joinedCommunities.map((community) => (
                          <Link
                            key={community.communityId} // Use a unique ID
                            to={`/c/${community.name}`}
                            className={`community-item ${isActive(`/c/${community.name}`) ? 'active' : ''}`}
                            onClick={onClose}
                          >
                            {community.iconUrl ? (
                              <img src={community.iconUrl} alt={`${community.name} icon`} className="community-icon" />
                            ) : (
                              // Fallback to first letter
                              <div className="community-icon-placeholder letter">
                                {community.name.charAt(0).toUpperCase()}
                              </div>
                            )}
                            <span>c/{community.name}</span>
                          </Link>
                        ))
                      )}

                      {!loadingCommunities && joinedCommunities.length === 0 && (
                         <div className="community-item-loading">
                          <span>No communities joined.</span>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="community-item-loading">
                      <span>Log in to see your communities.</span>
                    </div>
                  )}
                  {/* --- END NEW DYNAMIC CONTENT --- */}
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

      {/* --- NEW: Render the modal --- */}
      <CommunityModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCommunityCreated={handleCommunityCreated}
      />
    </>
  );
};

export default Sidebar;