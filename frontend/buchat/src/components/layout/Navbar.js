import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Home,
  Search,
  Plus,
  Bell,
  MessageCircle,
  User,
  Menu,
  X,
  TrendingUp,
  Moon,
  Sun,
  Settings, // Added for dropdown
  LogOut, // Added for dropdown
  LogIn, // Added for mobile menu
  UserPlus, // Added for mobile menu
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import Button from '../common/Button';
import './Navbar.css';

const Navbar = ({ onMenuToggle }) => {
  const { user, isAuthenticated, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery)}`);
      setSearchQuery('');
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/');
    setShowUserMenu(false);
  };

  // Helper to close dropdowns
  const closeAllMenus = () => {
    setShowUserMenu(false);
    setShowMobileMenu(false);
  };

  return (
    <nav className="navbar glass-nav">
      <div className="navbar-container">
        <div className="navbar-left">
          <button
            className="menu-button"
            onClick={onMenuToggle}
            aria-label="Toggle menu"
          >
            <Menu size={24} />
          </button>
          <Link to="/" className="navbar-brand" onClick={closeAllMenus}>
            <motion.div
              className="brand-logo"
              whileHover={{ rotate: 360 }}
              transition={{ duration: 0.6 }}
            >
              <TrendingUp size={28} />
            </motion.div>
            <span className="brand-text">BuChat</span>
          </Link>
        </div>

        <form className="navbar-search" onSubmit={handleSearch}>
          <Search size={18} className="search-icon" />
          <input
            type="text"
            placeholder="Search posts, communities..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
        </form>

        <div className="navbar-right">
          {/* --- Icon Group (Always Visible) --- */}
          <Link to="/trending" className="nav-icon-button" aria-label="Trending">
            <TrendingUp size={22} />
          </Link>
          <Link to="/messages" className="nav-icon-button" aria-label="Messages">
            <MessageCircle size={22} />
          </Link>
          <Link to="/create-post" className="nav-create-button">
            <Plus size={20} />
            <span>Create</span>
          </Link>
          <Link to="/notifications" className="nav-icon-button" aria-label="Notifications">
            <Bell size={22} />
            {/* <span className="notification-badge">3</span> */}
          </Link>
          
          {/* --- Theme Toggle (Always Visible) --- */}
          <button
            className="nav-icon-button theme-toggle"
            onClick={toggleTheme}
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
          </button>

          {/* --- Conditional Auth Section --- */}
          {isAuthenticated ? (
            <>
              <div className="user-menu-container">
                <button
                  className="user-avatar-button"
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  aria-label="User menu"
                >
                  {user?.avatar ? (
                    <img src={user.avatar} alt={user.username} />
                  ) : (
                    <div className="avatar-placeholder">
                      {user?.username?.[0]?.toUpperCase()}
                    </div>
                  )}
                </button>

                {showUserMenu && (
                  <motion.div
                    className="user-dropdown"
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <Link
                      to={`/u/${user?.username}`}
                      className="dropdown-item"
                      onClick={() => setShowUserMenu(false)}
                    >
                      <User size={18} />
                      Profile
                    </Link>
                    <Link
                      to="/settings"
                      className="dropdown-item"
                      onClick={() => setShowUserMenu(false)}
                    >
                      <Settings size={18} />
                      Settings
                    </Link>
                    {/* Theme toggle was here, but moved outside */}
                    <div className="dropdown-divider"></div>
                    <button className="dropdown-item" onClick={handleLogout}>
                      <LogOut size={18} />
                      Logout
                    </button>
                  </motion.div>
                )}
              </div>
            </>
          ) : (
            <>
              {/* Login/Signup buttons for non-auth users */}
              <Button variant="ghost" size="small" onClick={() => navigate('/login')}>
                Login
              </Button>
              <Button size="small" onClick={() => navigate('/register')}>
                Sign Up
              </Button>
            </>
          )}

          <button
            className="mobile-menu-button"
            onClick={() => setShowMobileMenu(!showMobileMenu)}
            aria-label="Toggle mobile menu"
          >
            {showMobileMenu ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {showMobileMenu && (
        <motion.div
          className="mobile-menu"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
        >
          <Link to="/" className="mobile-menu-item" onClick={closeAllMenus}>
            <Home size={20} />
            Home
          </Link>
          <Link to="/trending" className="mobile-menu-item" onClick={closeAllMenus}>
            <TrendingUp size={20} />
            Trending
          </Link>
          {/* --- Always Visible Mobile Links --- */}
          <Link
            to="/create-post"
            className="mobile-menu-item"
            onClick={closeAllMenus}
          >
            <Plus size={20} />
            Create Post
          </Link>
          <Link
            to="/notifications"
            className="mobile-menu-item"
            onClick={closeAllMenus}
          >
            <Bell size={20} />
            Notifications
          </Link>
          <Link
            to="/messages"
            className="mobile-menu-item"
            onClick={closeAllMenus}
          >
            <MessageCircle size={20} />
            Messages
          </Link>

          {/* --- Conditional Mobile Links --- */}
          {isAuthenticated ? (
            <>
              <Link
                to={`/u/${user?.username}`}
                className="mobile-menu-item"
                onClick={closeAllMenus}
              >
                <User size={20} />
                Profile
              </Link>
              <button className="mobile-menu-item" onClick={() => {
                handleLogout();
                closeAllMenus();
              }}>
                <LogOut size={20} />
                Logout
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="mobile-menu-item" onClick={closeAllMenus}>
                <LogIn size={20} />
                Login
              </Link>
              <Link to="/register" className="mobile-menu-item" onClick={closeAllMenus}>
                <UserPlus size={20} />
                Sign Up
              </Link>
            </>
          )}
        </motion.div>
      )}
    </nav>
  );
};

export default Navbar;