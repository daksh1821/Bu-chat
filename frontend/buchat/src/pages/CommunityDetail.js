import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
// --- THIS IS THE FIX ---
import { motion, AnimatePresence } from 'framer-motion'; 
// --- END OF FIX ---
import { 
  Users, 
  Plus, 
  Shield, 
  MoreHorizontal, 
  ChevronDown, 
  Rss, 
  Mail, 
  UserPlus, 
  Settings,
  PenSquare,
  BarChart2,
  Calendar,
  CheckCircle2,
  Image as ImageIcon
} from 'lucide-react';
import { toast } from 'react-toastify';
import { format } from 'date-fns';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import PostCard from '../components/posts/PostCard';
import { communityService } from '../services/communityService';
import { postService } from '../services/postService';
import { useAuth } from '../contexts/AuthContext';
import './CommunityDetail.css'; // Make sure to import the new CSS

const CommunityDetail = () => {
  const { communityName } = useParams();
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [community, setCommunity] = useState(null);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isMember, setIsMember] = useState(false);
  const [isBuildCardOpen, setIsBuildCardOpen] = useState(true);

  // Check if the current user is the creator
  const isCreator = user && community && (user.userId === community.creatorId || user.id === community.creatorId);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch community and posts in parallel
        const [communityData, postData] = await Promise.all([
          communityService.getCommunity(communityName),
          postService.getCommunityPosts(communityName)
        ]);

        if (communityData) {
          const fetchedCommunity = communityData.community || communityData;
          setCommunity(fetchedCommunity);
          // Assuming the community data includes whether the user is a member
          // You might need to add a service to check membership
          setIsMember(fetchedCommunity.isMember || false); 
        } else {
          throw new Error('Community not found');
        }

        setPosts(postData.posts || []);

      } catch (error) {
        console.error("Error fetching community data:", error);
        toast.error(error.message || 'Community not found');
        navigate('/communities');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [communityName, navigate]);

  const handleJoinLeave = async () => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }

    const action = isMember ? 'leave' : 'join';
    const originalState = isMember;
    
    // Optimistic update
    setIsMember(!originalState);
    setCommunity(prev => ({
      ...prev,
      memberCount: prev.memberCount + (originalState ? -1 : 1)
    }));
    
    try {
      if (originalState) {
        await communityService.leaveCommunity(communityName, user.userId);
        toast.success(`Left c/${communityName}`);
      } else {
        await communityService.joinCommunity(communityName, user.userId);
        toast.success(`Joined c/${communityName}!`);
      }
      // Re-fetch community data to get accurate member count
      const data = await communityService.getCommunity(communityName);
      setCommunity(data.community || data);
      setIsMember(data.isMember || !originalState);

    } catch (error) {
      // Revert on failure
      setIsMember(originalState);
      setCommunity(prev => ({
        ...prev,
        memberCount: prev.memberCount // Revert count
      }));
      toast.error('Action failed');
    }
  };

  const handleCreatePost = () => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    // Navigate to create post, pre-filling the community
    navigate('/create-post', { state: { communityName: community.name } });
  };

  const handlePostClick = (postId) => {
    navigate(`/post/${postId}`);
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
      </div>
    );
  }

  if (!community) return null;

  return (
    <div className="community-detail-page">
      {/* --- New Header --- */}
      <div className="community-header-banner">
        {/* Banner image would go here */}
      </div>
      <div className="community-header-main">
        <div className="community-header-content">
          <div className="community-header-icon">
            <Users size={32} />
          </div>
          <div className="community-header-info">
            <h1>{community.name} {isCreator && <CheckCircle2 size={24} className="verified-tick" />}</h1>
            <h2>c/{community.name}</h2>
          </div>
          {isCreator ? (
            <Button variant="primary" icon={<Shield size={18} />} onClick={() => toast.info('Mod Tools coming soon!')}>
              Mod Tools
            </Button>
          ) : (
            <Button 
              variant={isMember ? 'ghost' : 'primary'} 
              onClick={handleJoinLeave}
            >
              {isMember ? 'Joined' : 'Join'}
            </Button>
          )}
          <Button variant="ghost" icon={<MoreHorizontal size={20} />} className="icon-button" onClick={() => toast.info('More options...')} />
        </div>
      </div>
      
      {/* --- Main Content Area --- */}
      <div className="community-content-layout">
        <main className="community-content-main">
          {isCreator && (
            <div className="community-create-post-bar">
              <div className="create-post-avatar">
                <Users size={24} />
              </div>
              <input
                type="text"
                placeholder="Create Post"
                className="create-post-input"
                onClick={handleCreatePost}
                readOnly
              />
              <Button variant="ghost" icon={<ImageIcon size={20} />} className="icon-button" onClick={handleCreatePost} />
              <Button variant="ghost" icon={<Link size={20} />} className="icon-button" onClick={handleCreatePost} />
            </div>
          )}

          <div className="community-sort-bar">
            <Button variant="ghost" className="sort-button active">
              Best <ChevronDown size={16} />
            </Button>
            {/* Other sort buttons can go here */}
          </div>

          {/* --- Posts List or Empty State --- */}
          {posts.length > 0 ? (
            <div className="posts-list">
              {posts.map((post) => (
                <PostCard 
                  key={post.postId} 
                  post={post} 
                  onVote={() => {}} 
                  onPostClick={handlePostClick}
                />
              ))}
            </div>
          ) : (
            <div className="community-empty-state">
              <Shield size={64} />
              <h2>This community doesn't have any posts yet</h2>
              <p>Make one and get this feed started.</p>
              <Button variant="primary" onClick={handleCreatePost}>
                Create Post
              </Button>
            </div>
          )}
        </main>

        {/* --- New Right Sidebar --- */}
        <aside className="community-sidebar-right">
          {isCreator && (
            <Card className="sidebar-card build-community-card">
              <div className="sidebar-card-header" onClick={() => setIsBuildCardOpen(!isBuildCardOpen)}>
                <span>Build your community</span>
                <ChevronDown size={20} style={{ transform: isBuildCardOpen ? 'rotate(180deg)' : 'rotate(0deg)' }} />
              </div>
              <AnimatePresence>
                {isBuildCardOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="sidebar-card-content"
                  >
                    <p>Start setting up</p>
                    <div className="progress-bar">
                      <div className="progress" style={{ width: '20%' }}></div>
                    </div>
                    <p className="progress-label">1/3 achievements unlocked</p>
                    <Button variant="primary" fullWidth onClick={() => toast.info('Starting setup...')}>
                      Start
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>
            </Card>
          )}

          <Card className="sidebar-card about-community-card">
            <div className="sidebar-card-header">
              <span>About Community</span>
              {isCreator && (
                <Button variant="ghost" icon={<PenSquare size={16} />} className="icon-button" onClick={() => toast.info('Edit widget coming soon!')} />
              )}
            </div>
            <div className="sidebar-card-content">
              <div className="about-community-icon">
                <Users size={32} />
              </div>
              <h3>c/{community.name}</h3>
              <p>{community.description || 'No description set.'}</p>
              <span className="community-topic-tag">{community.topics || 'tech'}</span>
              
              <div className="about-community-stats">
                <div className="stat-item">
                  <span className="stat-number">{community.memberCount || 0}</span>
                  <span className="stat-label">Members</span>
                </div>
                <div className="stat-item">
                  <span className="stat-number">1</span>
                  <span className="stat-label">Online</span>
                </div>
              </div>
              
              <div className="sidebar-list-item">
                <Calendar size={20} />
                <span>Created {community.createdAt ? format(new Date(community.createdAt), 'MMM d, yyyy') : '...'}</span>
              </div>
              <div className="sidebar-list-item">
                <Rss size={20} />
                <span>Public</span>
              </div>
              
              <Button variant="ghost" icon={<Plus size={16} />} fullWidth onClick={() => toast.info('Add guide...')} >
                Add a community guide
              </Button>
              <Button variant="ghost" icon={<BarChart2 size={16} />} fullWidth onClick={() => toast.info('View insights...')} >
                Insights
              </Button>
            </div>
          </Card>

          <Card className="sidebar-card">
            <div className="sidebar-card-header">
              <span>Moderators</span>
            </div>
            <div className="sidebar-card-content">
              <Button variant="ghost" icon={<Mail size={16} />} fullWidth onClick={() => toast.info('Messaging mods...')}>
                Message Mods
              </Button>
              {isCreator && (
                <Button variant="ghost" icon={<UserPlus size={16} />} fullWidth onClick={() => toast.info('Invite mod...')}>
                  Invite Mod
                </Button>
              )}
              {/* List of mods would go here */}
              <div className="moderator-list">
                <Link to={`/u/${community.username}`} className="moderator-item">
                  <div className="moderator-avatar"></div>
                  <span>u/{community.username}</span>
                </Link>
              </div>
              <Button variant="ghost" fullWidth onClick={() => toast.info('Viewing all mods...')}>
                View all moderators
              </Button>
            </div>
          </Card>

          {isCreator && (
            <Card className="sidebar-card">
              <div className="sidebar-card-header">
                <span>Community Settings</span>
              </div>
              <div className="sidebar-card-content">
                <Link to="#" className="sidebar-list-item" onClick={() => toast.info('Coming soon!')}>
                  <span>Community Appearance</span>
                  <Settings size={20} />
                </Link>
              </div>
            </Card>
          )}

          <Card className="sidebar-card">
            <div className="sidebar-card-header">
              <span>BuChat Rules</span>
            </div>
            <div className="sidebar-card-content">
              {/* Rules list */}
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
};

export default CommunityDetail;