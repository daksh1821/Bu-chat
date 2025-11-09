import React, { useState, useRef } from 'react';
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
import './CreateCommunityModal.css';

// Expanded list of all topics
const allTopics = [
  // Original
  'Anime & Cosplay', 'Anime', 'Manga', 'Art', 'Performing Arts', 'Architecture', 
  'Design', 'Filmmaking', 'Digital Art', 'Photography', 'Business & Finance', 
  'Business', 'Economics', 'Business News & Discussion', 'Deals & Marketplace', 
  'Startup & Entrepreneurial', 'Real Estate', 'Stocks & Investing', 'Collecting & Other Hobbies', 
  'Model Building', 'Collectibles', 'Other Hobbies', 'Tags',
  // Gaming
  'Gaming', 'Action Games', 'Strategy Games', 'RPG', 'Indie Games', 'eSports', 
  'PC Gaming', 'Console Gaming', 'PlayStation', 'Xbox', 'Nintendo', 'Mobile Gaming', 
  'Board Games', 'Card Games', 'Dungeons & Dragons', 'Streamers', 'Twitch',
  // Technology
  'Technology', 'Programming', 'JavaScript', 'React', 'Python', 'Node.js', 
  'Web Development', 'Mobile Development', 'AI & Machine Learning', 'Cybersecurity', 
  'Gadgets', 'Smartphones', 'Apple', 'Android', 'Linux', 'PC Building', 'Crypto & Blockchain',
  // Science
  'Science', 'Physics', 'Chemistry', 'Biology', 'Mathematics', 'Space & Astronomy', 
  'Environment', 'Psychology', 'Neuroscience', 'Robotics', 'Data Science',
  // Lifestyle
  'Lifestyle', 'Fashion & Beauty', 'Mens Fashion', 'Womens Fashion', 'Makeup', 
  'Skincare', 'Health & Fitness', 'Fitness', 'Weight Loss', 'Nutrition', 'Yoga', 
  'Meditation', 'Mental Health', 'Relationships', 'Parenting', 'DIY & Crafts', 
  'Home Improvement', 'Gardening', 'Personal Finance',
  // Food & Drink
  'Food & Drink', 'Cooking', 'Baking', 'Recipes', 'Healthy Food', 'Vegan', 
  'Vegetarian', 'Beer', 'Wine', 'Coffee', 'Tea', 'Restaurants',
  // Travel
  'Travel', 'Solo Travel', 'Backpacking', 'Digital Nomads', 'Travel Deals', 
  'Europe', 'Asia', 'North America', 'South America', 'Africa', 'Australia',
  // Sports
  'Sports', 'Football (Soccer)', 'American Football', 'Basketball', 'Baseball', 
  'Hockey', 'Tennis', 'Golf', 'Motorsports', 'Formula 1', 'NASCAR', 'MMA', 
  'Pro Wrestling', 'Olympics', 'Fantasy Sports',
  // Music
  'Music', 'Pop', 'Rock', 'Hip-Hop', 'Electronic Music', 'Classical Music', 
  'Jazz', 'Metal', 'Music Production', 'Guitar', 'Piano', 'DJs', 'Spotify',
  // Movies & TV
  'Movies & TV', 'Movies', 'TV Shows', 'Netflix', 'Disney+', 'Marvel', 'DC Comics', 
  'Star Wars', 'Sci-Fi & Fantasy', 'Horror', 'Documentaries', 'Celebrities',
  // Books & Writing
  'Books & Writing', 'Books', 'Literature', 'Fantasy Books', 'Sci-Fi Books', 
  'Writing', 'Poetry', 'Screenwriting',
  // Hobbies
  'Hobbies', '3D Printing', 'Lego', 'Woodworking', 'Knitting', 'Drawing', 'Painting',
  'Cars', 'Motorcycles', 'Photography', 'Astrophotography', 'Aquariums',
  // Culture & Society
  'Culture & Society', 'History', 'Philosophy', 'Politics', 'World News', 
  'Social Issues', 'Languages', 'Education', 'University',
  // Regional
  'India', 'United Kingdom', 'Canada', 'Germany', 'France', 'Japan', 'South Korea',
  // Other
  'Memes', 'Funny', 'Aww', 'Wholesome', 'Interesting', 'Nature', 'Pets', 
  'Dogs', 'Cats', 'Birds', 'Ask', 'Explain Like I\'m 5'
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
    bannerPreview: null,
    iconPreview: null,
    bannerFile: null,
    iconFile: null,
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false); // Prevent double-clicks

  const bannerInputRef = useRef(null);
  const iconInputRef = useRef(null);

  const nextStep = () => setStep((s) => s + 1);
  const prevStep = () => setStep((s) => s - 1);

  const handleDataChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleFileChange = (event, fileType) => {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file (PNG, JPG, etc.)');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setFormData(prev => ({
          ...prev,
          [`${fileType}Preview`]: reader.result,
          [`${fileType}File`]: file,
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleFileRemove = (fileType) => {
    setFormData(prev => ({
      ...prev,
      [`${fileType}Preview`]: null,
      [`${fileType}File`]: null,
    }));
    if (fileType === 'icon' && iconInputRef.current) {
      iconInputRef.current.value = null;
    }
    if (fileType === 'banner' && bannerInputRef.current) {
      bannerInputRef.current.value = null;
    }
  };


  const toggleTopic = (topic) => {
    setFormData((prev) => {
      const newTopics = prev.topics.includes(topic)
        ? prev.topics.filter((t) => t !== topic)
        : [...prev.topics, topic];
      
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
      setStep(1);
      return;
    }

    setIsSubmitting(true);
    toast.success(`Creating community c/${formData.name}...`);

    try {
      // Step 1: Create the community with text data
      const payload = {
        name: formData.name,
        displayName: formData.name,
        description: formData.description,
        communityType: formData.communityType,
        isMature: formData.isMature,
        topics: formData.topics.join(','),
        userId: user.userId || user.id, 
        username: user.username,
      };
      
      console.log('Sending text payload:', payload);
      // Assuming your service returns the new community object with its ID
      const newCommunity = await communityService.createCommunity(payload);
      
      // --- THIS IS THE NEW PART ---
      // Step 2: If files were selected, upload them now.
      // TODO: You must implement communityService.uploadCommunityImage
      // This function needs to take the community ID/name and the file
      // and send it to your backend as 'form-data'.

      if (formData.iconFile) {
        try {
          toast.info('Uploading icon...');
          // const iconData = new FormData();
          // iconData.append('file', formData.iconFile);
          // await communityService.uploadCommunityImage(newCommunity.id, 'icon', iconData);
          console.log('Icon upload feature needs backend implementation.');
        } catch (uploadError) {
          console.error('Icon upload failed:', uploadError);
          toast.error('Community created, but icon upload failed.');
        }
      }
      
      if (formData.bannerFile) {
         try {
          toast.info('Uploading banner...');
          // const bannerData = new FormData();
          // bannerData.append('file', formData.bannerFile);
          // await communityService.uploadCommunityImage(newCommunity.id, 'banner', bannerData);
          console.log('Banner upload feature needs backend implementation.');
        } catch (uploadError) {
          console.error('Banner upload failed:', uploadError);
          toast.error('Community created, but banner upload failed.');
        }
      }
      // --- END OF NEW PART ---
      
      if (onCommunityCreated) {
        onCommunityCreated(formData.name);
      }
      resetAndClose();

    } catch (error) {
      console.error("Failed to create community:", error.response || error);
      if (error.response && error.response.data) {
        toast.error(error.response.data.error || error.response.data.message || 'Failed to create community');
      } else {
        toast.error(error.message || 'Failed to create community');
      }
    } finally {
      setIsSubmitting(false);
    }
  };
  // --- END OF UPDATED HANDLER ---

  const resetAndClose = () => {
    setFormData({
      name: '',
      description: '',
      communityType: 'Public',
      isMature: false,
      topics: [],
      bannerPreview: null,
      iconPreview: null,
      bannerFile: null,
      iconFile: null,
    });
    setStep(1);
    onClose();
  };

  const filteredTopics = allTopics.filter(topic =>
    topic.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const renderStep = () => {
    switch (step) {
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
      case 2:
        return (
          <>
            <h2>Style your community</h2>
            <p>Choose an icon and banner to draw attention and help establish your community's culture! You can update this at any time.</p>
            
            {/* Hidden file inputs */}
            <input 
              type="file" 
              ref={bannerInputRef} 
              onChange={(e) => handleFileChange(e, 'banner')} 
              style={{ display: 'none' }} 
              accept="image/*"
            />
            <input 
              type="file" 
              ref={iconInputRef} 
              onChange={(e) => handleFileChange(e, 'icon')} 
              style={{ display: 'none' }} 
              accept="image/*"
            />

            <div className="style-upload">
              <label>Banner {formData.bannerFile && <span className="file-name">({formData.bannerFile.name})</span>}</label>
              <div>
                {formData.bannerPreview && (
                  <Button variant="ghost" className="upload-btn remove" onClick={() => handleFileRemove('banner')}>Remove</Button>
                )}
                <Button 
                  icon={<Image size={16} />} 
                  variant="ghost" 
                  className="upload-btn"
                  onClick={() => bannerInputRef.current.click()}
                >
                  {formData.bannerPreview ? 'Change' : 'Add'}
                </Button>
              </div>
            </div>
            <div className="style-upload">
              <label>Icon {formData.iconFile && <span className="file-name">({formData.iconFile.name})</span>}</label>
              <div>
                {formData.iconPreview && (
                  <Button variant="ghost" className="upload-btn remove" onClick={() => handleFileRemove('icon')}>Remove</Button>
                )}
                <Button 
                  icon={<Image size={16} />} 
                  variant="ghost" 
                  className="upload-btn"
                  onClick={() => iconInputRef.current.click()}
                >
                  {formData.iconPreview ? 'Change' : 'Add'}
                </Button>
              </div>
            </div>

            <div className="style-preview">
              <div 
                className="preview-banner" 
                style={{ backgroundImage: formData.bannerPreview ? `url(${formData.bannerPreview})` : 'none' }}
              ></div>
              <div className="preview-icon-row">
                <div className="preview-icon">
                  {formData.iconPreview ? (
                    <img src={formData.iconPreview} alt="Icon preview" />
                  ) : (
                    <Users size={24} />
                  )}
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
                <Button variant="primary" onClick={handleSubmit} disabled={isSubmitting}>
                  {isSubmitting ? 'Creating...' : 'Create Community'}
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