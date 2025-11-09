// FILE: src/components/community/CommunityModal.js

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  ArrowLeft, 
  Users, 
  Lock, 
  Eye, 
  Image, 
  Search, 
  Check,
  Globe
} from 'lucide-react';
import { toast } from 'react-toastify';
import { communityService } from '../../services/communityService';
import { useAuth } from '../../contexts/AuthContext';
import Button from '../common/Button';
import './CreateCommunityModal.css'; // This CSS file is still the same

// List of all topics from the screenshot
const allTopics = [
  'Anime & Cosplay', 'Anime', 'Manga', 'Art', 'Performing Arts', 'Architecture', 
  'Design', 'Filmmaking', 'Digital Art', 'Photography', 'Business & Finance', 
  'Business', 'Economics', 'Business News & Discussion', 'Deals & Marketplace', 
  'Startup & Entrepreneurial', 'Real Estate', 'Stocks & Investing', 'Collecting & Other Hobbies', 
  'Model Building', 'Collectibles', 'Other Hobbies', 'Tags'
];

const modalVariants = {
  hidden: { opacity: 0, y: 50, scale: 0.95 },
  visible: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: 50, scale: 0.95 },
};

const CommunityModal = ({ isOpen, onClose, onCommunityCreated }) => {
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    communityType: 'Public',
    isMature: false,
    topics: [],
    banner: null,
    icon: null,
  });
  const [searchTerm, setSearchTerm] = useState('');

  const nextStep = () => setStep((s) => s + 1);
  const prevStep = () => setStep((s) => s - 1);

  const handleDataChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const toggleTopic = (topic) => {
    setFormData((prev) => {
      const newTopics = prev.topics.includes(topic)
        ? prev.topics.filter((t) => t !== topic)
        : [...prev.topics, topic];
      
      // Enforce max 5 topics
      if (newTopics.length > 5) {
        toast.warn('You can select a maximum of 5 topics.');
        return prev;
      }
      return { ...prev, topics: newTopics };
    });
  };

  // --- UPDATED SUBMIT HANDLER ---
  const handleSubmit = async () => {
    if (!user) {
      toast.error('You must be logged in to create a community.');
      return;
    }
    
    if (!formData.name) {
      toast.error('Please enter a community name.');
      setStep(1); // Go back to step 1
      return;
    }

    try {
      toast.success(`Creating community c/${formData.name}...`);
      
      // --- THIS IS THE FIX ---
      // Added 'displayName' to the payload
      const payload = {
        name: formData.name,
        displayName: formData.name, // Added this line
        description: formData.description,
        communityType: formData.communityType,
        isMature: formData.isMature,
        topics: formData.topics.join(','),
        userId: user.userId || user.id, 
        username: user.username,
      };
      // --- END OF FIX ---
      
      console.log('Sending payload to createCommunity:', payload);

      // Call the service
      const newCommunity = await communityService.createCommunity(payload);
      
      if (onCommunityCreated) {
        onCommunityCreated(formData.name);
      }
      resetAndClose();
    } catch (error) {
      console.error("Failed to create community:", error.response || error);
      
      if (error.response && error.response.data && error.response.data.message) {
        toast.error(error.response.data.message);
      } else if (error.response && error.response.data) {
        // Handle cases where the error message might be in a different format
        // This will grab "name and displayName required"
        toast.error(error.response.data.error || error.response.data.message || 'Failed to create community');
      } else {
        toast.error(error.message || 'Failed to create community');
      }
    }
  };

  const resetAndClose = () => {
    setFormData({
      name: '',
      description: '',
      communityType: 'Public',
      isMature: false,
      topics: [],
      banner: null,
      icon: null,
    });
    setStep(1);
    onClose();
  };

  const filteredTopics = allTopics.filter(topic =>
    topic.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const renderStep = () => {
    switch (step) {
      // Step 1: Tell us about your community
      case 1:
        return (
          <>
            <h2>Tell us about your community</h2>
            <p>A name and description help people understand what your community is all about.</p>
            <div className="input-group">
              <label htmlFor="name">Community Name</label>
              <span className="input-prefix">c/</span>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleDataChange}
                placeholder="CommunityName"
                className="input-with-prefix"
                maxLength={21}
              />
              <span className="char-count">{formData.name.length} / 21</span>
            </div>
            <div className="input-group">
              <label htmlFor="description">Description</label>
              <textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleDataChange}
                placeholder="tech-related community"
                rows={4}
                maxLength={500}
              />
              <span className="char-count">{formData.description.length} / 500</span>
            </div>
          </>
        );
      // Step 2: Style your community
      case 2:
        return (
          <>
            <h2>Style your community</h2>
            <p>Choose an icon and banner to draw attention and help establish your community's culture! You can update this at any time.</p>
            <div className="style-upload">
              <label>Banner</label>
              <Button icon={<Image size={16} />} variant="ghost" className="upload-btn">Add</Button>
            </div>
            <div className="style-upload">
              <label>Icon</label>
              <Button icon={<Image size={16} />} variant="ghost" className="upload-btn">Add</Button>
            </div>
            <div className="style-preview">
              <div className="preview-banner"></div>
              <div className="preview-icon-row">
                <div className="preview-icon">
                  <Users size={24} />
                </div>
                <div className="preview-text">
                  <h4>c/{formData.name || 'CommunityName'}</h4>
                  <p>1 member · 1 online</p>
                  <p>{formData.description || 'tech-related community'}</p>
                </div>
              </div>
            </div>
          </>
        );
      // Step 3: Add topics
      case 3:
        return (
          <>
            <h2>Add topics</h2>
            <p>Add up to 5 topics to help interested finditors find your community.</p>
            <div className="search-topics">
              <Search size={18} className="search-icon" />
              <input
                type="text"
                placeholder="Filter topics"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="topics-list">
              {filteredTopics.map(topic => (
                <button 
                  key={topic} 
                  className={`topic-tag ${formData.topics.includes(topic) ? 'selected' : ''}`}
                  onClick={() => toggleTopic(topic)}
                  disabled={formData.topics.length >= 5 && !formData.topics.includes(topic)}
                >
                  {topic}
                  {formData.topics.includes(topic) && <Check size={16} />}
                </button>
              ))}
            </div>
            <p className="topics-count">Topics {formData.topics.length}/5</p>
          </>
        );
      // Step 4: What kind of community is this?
      case 4:
        return (
          <>
            <h2>What kind of community is this?</h2>
            <p>Decide who can view and contribute to your community. Only public communities show up in search. <strong>Important:</strong> Once set, you will need to submit a request to change your community types.</p>
            <div className="radio-group">
              <label className="radio-option">
                <input
                  type="radio"
                  name="communityType"
                  value="Public"
                  checked={formData.communityType === 'Public'}
                  onChange={handleDataChange}
                />
                <div className="radio-icon"><Globe size={20} /></div>
                <div className="radio-text">
                  <strong>Public</strong>
                  <p>Anyone can view, post, and comment to this community</p>
                </div>
              </label>
              <label className="radio-option">
                <input
                  type="radio"
                  name="communityType"
                  value="Restricted"
                  checked={formData.communityType === 'Restricted'}
                  onChange={handleDataChange}
                />
                <div className="radio-icon"><Eye size={20} /></div>
                <div className="radio-text">
                  <strong>Restricted</strong>
                  <p>Anyone can view, but only approved users can contribute</p>
                </div>
              </label>
              <label className="radio-option">
                <input
                  type="radio"
                  name="communityType"
                  value="Private"
                  checked={formData.communityType === 'Private'}
                  onChange={handleDataChange}
                />
                <div className="radio-icon"><Lock size={20} /></div>
                <div className="radio-text">
                  <strong>Private</strong>
                  <p>Only approved users can view and contribute</p>
                </div>
              </label>
            </div>
            <div className="checkbox-option">
              <label htmlFor="isMature">
                <input
                  type="checkbox"
                  id="isMature"
                  name="isMature"
                  checked={formData.isMature}
                  onChange={handleDataChange}
                />
                <div className="checkbox-text">
                  <strong>Mature (18+)</strong>
                  <p>Must be over 18 to view and contribute</p>
                </div>
              </label>
            </div>
          </>
        );
      default:
        return null;
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="modal-backdrop" onClick={resetAndClose}>
          <motion.div
            className="modal-content"
            variants={modalVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              {step > 1 && (
                <button className="modal-back-btn" onClick={prevStep}>
                  <ArrowLeft size={20} />
                </button>
              )}
              <h3>Create a community</h3>
              <button className="modal-close-btn" onClick={resetAndClose}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              {renderStep()}
            </div>
            <div className="modal-footer">
              <p className="step-indicator">Step {step} of 4</p>
              {step < 4 ? (
                <Button 
                  variant="primary" 
                  onClick={nextStep} 
                  disabled={(step === 1 && !formData.name.trim())} // Disable if no name
                >
                  Next
                </Button>
              ) : (
                <Button variant="primary" onClick={handleSubmit}>
                  Create Community
                </Button>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default CommunityModal;