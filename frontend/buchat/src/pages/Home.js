import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Filter, TrendingUp, Clock, BarChart } from 'lucide-react';
import { useNavigate } from 'react-router-dom'; // Import useNavigate
import PostCard from '../components/posts/PostCard';
import Button from '../components/common/Button';
import Card from '../components/common/Card';
import { communityService } from '../services/communityService';
import { postService } from '../services/postService';
import { useAuth } from '../contexts/AuthContext';
import './Home.css';

const Home = () => {
  const { user, isAuthenticated } = useAuth();
  const [posts, setPosts] = useState([]);
  const [communities, setCommunities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('hot');
  const [lastKey, setLastKey] = useState(null);
  const navigate = useNavigate(); // Initialize navigate

  useEffect(() => {
    fetchPosts();
    fetchCommunities();
  }, [sortBy]);

  const fetchPosts = async () => {
    try {
      setLoading(true);
      // For now, get trending posts as feed
      const response = await postService.getTrendingPosts({ 
        sort: sortBy, 
        limit: 20 
      });
      setPosts(response.posts || []);
    } catch (error) {
      console.error('Error fetching posts:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCommunities = async () => {
    try {
      const response = await communityService.getAllCommunities({ limit: 5 });
      setCommunities(response.communities || []);
    } catch (error) {
      console.error('Error fetching communities:', error);
    }
  };

  // --- NEW: Handler to navigate to post detail ---
  const handlePostClick = (postId) => {
    navigate(`/post/${postId}`);
  };

  const sortOptions = [
    { value: 'hot', label: 'Hot', icon: TrendingUp },
    { value: 'new', label: 'New', icon: Clock },
    { value: 'top', label: 'Top', icon: BarChart },
  ];

  return (
    <div className="home-page">
      <div className="home-container">
        <main className="home-main">
          <Card className="sort-bar">
            <div className="sort-buttons">
              {sortOptions.map((option) => (
                <Button
                  key={option.value}
                  variant={sortBy === option.value ? 'primary' : 'ghost'}
                  size="small"
                  onClick={() => setSortBy(option.value)}
                  icon={<option.icon size={18} />}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </Card>

          {loading ? (
            <div className="loading-container">
              <div className="spinner"></div>
            </div>
          ) : posts.length > 0 ? (
            <motion.div
              className="posts-list"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5 }}
            >
              {posts.map((post, index) => (
                <motion.div
                  key={post.postId}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                >
                  {/* --- UPDATED: Pass the new onPostClick handler --- */}
                  <PostCard 
                    post={post} 
                    onVote={fetchPosts} 
                    onPostClick={handlePostClick} // Pass handler
                  />
                </motion.div>
              ))}
            </motion.div>
          ) : (
            <Card>
              <div className="empty-state">
                <h3>No posts yet</h3>
                <p>Be the first to create a post in a community!</p>
                <Button onClick={() => (window.location.href = '/communities')}>
                  Explore Communities
                </Button>
              </div>
            </Card>
          )}
        </main>

        <aside className="home-sidebar">
          {isAuthenticated && (
            <Card className="create-post-card">
              <h3>Create Post</h3>
              <p>Share something with the community</p>
              <Button fullWidth onClick={() => (window.location.href = '/create-post')}>
                Create Post
              </Button>
            </Card>
          )}

          <Card className="communities-card">
            <h3>Popular Communities</h3>
            {communities.length > 0 ? (
              <div className="communities-list">
                {communities.map((community) => (
                  <a
                    key={community.communityId}
                    href={`/c/${community.name}`}
                    className="community-item"
                  >
                    <div className="community-info">
                      <span className="community-name">c/{community.name}</span>
                      <span className="community-members">
                        {community.memberCount || 0} members
                      </span>
                    </div>
                  </a>
                ))}
              </div>
            ) : (
              <p className="text-muted">No communities yet</p>
            )}
            <Button
              variant="ghost"
              size="small"
              fullWidth
              onClick={() => (window.location.href = '/communities')}
            >
              View All
            </Button>
          </Card>

          <Card className="info-card">
            <h3>Welcome to BuChat</h3>
            <p>
              Your home for communities, discussions, and unique features like polls,
              time capsules, and events!
            </p>
          </Card>
        </aside>
      </div>
    </div>
  );
};

export default Home;