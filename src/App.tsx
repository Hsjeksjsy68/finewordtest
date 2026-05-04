/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, useNavigate, useLocation, useParams } from 'react-router-dom';
import { Home, MessageCircle, User as UserIcon, Heart, Send, PlusSquare, Image as ImageIcon, ChevronLeft, MoreHorizontal, LogOut, Search, Moon, Sun, Share2 } from 'lucide-react';
import { formatDistanceToNow, format, isSameDay } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { db, auth } from './firebase';
import { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, onSnapshot, query, orderBy, serverTimestamp, Timestamp, where } from 'firebase/firestore';
import { signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';

const resizeImage = (file: File, maxWidth: number, maxHeight: number): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width *= ratio;
          height *= ratio;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/webp', 0.8));
        } else {
          reject(new Error("Canvas context is null"));
        }
      };
      img.onerror = reject;
      img.src = event.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- MOCK DATA & TYPES ---

type User = {
  id: string;
  username: string;
  name: string;
  avatar: string;
  bio: string;
};

type Post = {
  id: string;
  userId: string;
  imageUrl: string;
  caption: string;
  likes: number;
  likedBy: string[];
  createdAt: Date;
};

type Story = {
  id: string;
  userId: string;
  imageUrl: string;
  createdAt: Date;
  expiresAt: Date;
};

type Comment = {
  id: string;
  postId: string;
  userId: string;
  text: string;
  createdAt: Date;
};

type Message = {
  id: string;
  chatId: string;
  senderId: string;
  text: string;
  imageUrl?: string;
  createdAt: Date;
};

type Notification = {
  id: string;
  userId: string;
  actorId: string;
  type: 'like' | 'comment' | 'follow';
  postId?: string;
  read: boolean;
  createdAt: Date;
};

type Chat = {
  id: string;
  users: string[];
  lastMessage: string;
  updatedAt: Date;
  seenBy?: string[];
};


const CURRENT_USER: User = {
  id: 'u1',
  username: 'alex_dev',
  name: 'Alex Developer',
  avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Alex',
  bio: 'Building awesome apps with Flutter & React ð',
};

const MOCK_USERS: Record<string, User> = {
  u2: { id: 'u2', username: 'sarah.codes', name: 'Sarah Smith', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Sarah', bio: 'Frontend enthusiast' },
  u3: { id: 'u3', username: 'mike_design', name: 'Mike J', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Mike', bio: 'UI/UX Designer. Dark mode everything.' },
};

const INITIAL_POSTS: Post[] = [
  {
    id: 'p1',
    userId: 'u2',
    imageUrl: 'https://images.unsplash.com/photo-1555099962-4199c345e5dd?w=800&q=80',
    caption: 'Just launched my new portfolio! Check it out ð #coding #webdev',
    likes: 124,
    likedBy: [],
    createdAt: new Date(Date.now() - 1000 * 60 * 30), // 30 mins ago
  },
  {
    id: 'p2',
    userId: 'u3',
    imageUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&q=80',
    caption: 'Workspace aesthetic ã½ï¸',
    likes: 89,
    likedBy: ['u1'],
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2 hours ago
  },
];

const INITIAL_CHATS: Chat[] = [
  { id: 'c1', users: ['u1', 'u2'], lastMessage: 'That looks amazing! Thanks!', updatedAt: new Date(Date.now() - 1000 * 60 * 5) },
  { id: 'c2', users: ['u1', 'u3'], lastMessage: 'Let me know when you are free to chat.', updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24) },
];

const INITIAL_MESSAGES: Message[] = [
  { id: 'm1', chatId: 'c1', senderId: 'u2', text: 'Hey Alex, did you finish the Flutter setup?', createdAt: new Date(Date.now() - 1000 * 60 * 6) },
  { id: 'm2', chatId: 'c1', senderId: 'u1', text: 'That looks amazing! Thanks!', createdAt: new Date(Date.now() - 1000 * 60 * 5) },
];

// --- CONTEXT ---
interface AppState {
  currentUser: User | null;
  logout: () => void;
  updateProfile: (data: Partial<User>) => void;
  posts: Post[];
  setPosts: React.Dispatch<React.SetStateAction<Post[]>>;
  updatePost: (postId: string, newCaption: string) => Promise<void>;
  deletePost: (postId: string) => Promise<void>;
  chats: Chat[];
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  notifications: Notification[];
  followingIds: string[];
  toggleLike: (postId: string) => void;
  sendMessage: (chatId: string, text: string, imageUrl?: string) => void;
  showToast: (msg: string) => void;
  theme: 'light' | 'dark';
  setTheme: (t: 'light' | 'dark') => void;
}

const AppContext = React.createContext<AppState | null>(null);
const useApp = () => React.useContext(AppContext)!;

// --- COMPONENTS ---

const BottomNav = () => {
  const location = useLocation();
  const { chats, currentUser } = useApp();
  
  const hasUnseenMessages = chats.some(c => currentUser && (!c.seenBy || !c.seenBy.includes(currentUser.id)) && c.lastMessage);

  const navItems = [
    { path: '/', icon: Home },
    { path: '/search', icon: Search },
    { path: '/create', icon: PlusSquare },
    { path: '/chat', icon: MessageCircle, hasUnseen: hasUnseenMessages },
    { path: '/profile', icon: UserIcon },
  ];

  // Hide nav on conversation screen
  if (location.pathname.startsWith('/chat/')) return null;

  return (
    <nav className="shrink-0 h-16 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black flex justify-around items-center px-4 z-50">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = location.pathname === item.path;
        return (
          <Link key={item.path} to={item.path} className="relative p-2">
            <Icon 
              size={24} 
              className={cn("transition-colors", isActive ? "text-indigo-400" : "text-zinc-600 hover:text-zinc-500 dark:text-zinc-500 dark:text-zinc-400")} 
              strokeWidth={isActive ? 2.5 : 2}
            />
            {item.hasUnseen && (
              <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 border-2 border-white dark:border-black rounded-full" />
            )}
          </Link>
        );
      })}
    </nav>
  );
};

const PostItem: React.FC<{ post: Post }> = ({ post }) => {
  const { toggleLike, showToast, currentUser, updatePost, deletePost } = useApp();
  const navigate = useNavigate();
  const [author, setAuthor] = React.useState<User | null>(null);
  const [showOptions, setShowOptions] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editCaption, setEditCaption] = useState(post.caption || '');

  useEffect(() => {
    if (post.userId === currentUser?.id) {
      setAuthor(currentUser);
    } else {
      getDoc(doc(db, 'users', post.userId)).then(d => {
        if (d.exists()) setAuthor(d.data() as User);
        else setAuthor({ username: 'unknown', avatar: '', name: 'Unknown', id: post.userId, bio: '' });
      });
    }
  }, [post.userId, currentUser]);

  const user = author || { username: '...', avatar: '', name: '...', id: post.userId, bio: '' };
  const isLiked = currentUser ? post.likedBy.includes(currentUser.id) : false;

  const handleShare = () => {
    const url = `${window.location.origin}/post/${post.id}/comments`;
    navigator.clipboard.writeText(url).then(() => {
      showToast('Link copied to clipboard!');
      setShowOptions(false);
    }).catch(() => {
      showToast('Failed to copy link');
      setShowOptions(false);
    });
  };

  const handleSaveEdit = async () => {
    if (editCaption === post.caption) {
      setIsEditing(false);
      return;
    }
    await updatePost(post.id, editCaption);
    setIsEditing(false);
    showToast('Post updated');
  };

  const handleDelete = async () => {
    if (confirm('Are you sure you want to delete this post?')) {
      await deletePost(post.id);
      showToast('Post deleted');
    }
  };

  return (
    <div className="mb-6 flex flex-col gap-3 relative bg-white dark:bg-zinc-950 sm:border border-zinc-200 dark:border-zinc-800 sm:rounded-2xl pb-4">
      <div className="flex items-center gap-3 px-5 pt-4">
        <Link to={`/${user.username}`} className="flex items-center gap-3 flex-1 overflow-hidden group">
          <img src={user.avatar || undefined} alt={user.username} className="w-10 h-10 rounded-full bg-zinc-200 dark:bg-zinc-800 p-0.5 object-cover" />
          <div className="font-semibold text-[14px] flex-1 text-zinc-900 dark:text-zinc-100 group-hover:text-zinc-500 transition-colors truncate">{user.username}</div>
        </Link>
        <div className="relative">
          <button onClick={() => setShowOptions(!showOptions)} className="p-2 -mr-2"><MoreHorizontal size={20} className="text-zinc-600 hover:text-zinc-500 dark:text-zinc-500 dark:text-zinc-400 transition-colors" /></button>
          
          {showOptions && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowOptions(false)} />
              <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-lg z-50 overflow-hidden flex flex-col">
                <button onClick={handleShare} className="text-left px-4 py-3 text-[14px] text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 dark:hover:text-white transition-colors">Share</button>
                {currentUser?.id === post.userId ? (
                  <>
                    <button onClick={() => { setIsEditing(true); setShowOptions(false); }} className="text-left px-4 py-3 text-[14px] text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 dark:hover:text-white transition-colors">Edit</button>
                    <button onClick={() => { handleDelete(); setShowOptions(false); }} className="text-left px-4 py-3 text-[14px] text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">Delete</button>
                  </>
                ) : (
                  <button onClick={() => { showToast('Report sent'); setShowOptions(false); }} className="text-left px-4 py-3 text-[14px] text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">Report</button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
      {(post.imageUrl || post.caption) && (
        <div className={cn("w-full bg-zinc-100 dark:bg-zinc-950 px-0 relative", (!post.imageUrl) && "aspect-[4/3] flex items-center justify-center p-6")}>
          {post.imageUrl ? (
            <img src={post.imageUrl} alt="Post" className="w-full h-auto max-h-[80vh] object-cover bg-zinc-100 dark:bg-zinc-950" />
          ) : (
            <div className="text-xl font-medium text-center text-zinc-900 dark:text-zinc-100 italic">
              {post.caption}
            </div>
          )}
        </div>
      )}
      <div className="px-5 pt-2">
        <div className="flex items-center gap-4 mb-3">
          <button onClick={() => toggleLike(post.id)} className="group">
            <Heart size={24} className={cn("transition-all duration-300", isLiked ? "fill-rose-500 text-rose-500 scale-110" : "text-zinc-900 dark:text-zinc-100 group-hover:text-zinc-500")} />
          </button>
          <button onClick={() => navigate(`/post/${post.id}/comments`)} className="group">
            <MessageCircle size={24} className="text-zinc-900 dark:text-zinc-100 group-hover:text-zinc-500 transition-colors" />
          </button>
          <button onClick={handleShare} className="group">
            <Share2 size={24} className="text-zinc-900 dark:text-zinc-100 group-hover:text-zinc-500 transition-colors" />
          </button>
        </div>
        <p className="font-semibold text-[14px] text-zinc-900 dark:text-zinc-100 mb-2">{post.likes.toLocaleString()} likes</p>
        
        {isEditing ? (
          <div className="flex flex-col gap-2 mt-2">
            <textarea
              className="w-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-3 text-[14px] text-zinc-900 dark:text-zinc-100 resize-none focus:outline-none focus:border-indigo-500"
              value={editCaption}
              onChange={e => setEditCaption(e.target.value)}
              rows={3}
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => { setIsEditing(false); setEditCaption(post.caption || ''); }} className="px-4 py-1.5 text-[13px] font-medium text-zinc-600 dark:text-zinc-400">Cancel</button>
              <button onClick={handleSaveEdit} className="px-4 py-1.5 text-[13px] font-medium bg-indigo-500 text-white rounded-md">Save</button>
            </div>
          </div>
        ) : (
          <p className="text-[14px] leading-relaxed">
            <span className="font-semibold mr-2 text-zinc-900 dark:text-zinc-100">{user.username}</span>
            <span className="text-zinc-800 dark:text-zinc-200">{post.caption}</span>
          </p>
        )}
        
        <p className="text-[11px] text-zinc-500 dark:text-zinc-500 mt-2 uppercase tracking-wide font-medium">
          {formatDistanceToNow(post.createdAt, { addSuffix: true })}
        </p>
      </div>
    </div>
  );
};

// --- COMMENTS SCREEN ---
const CommentsScreen = () => {
  const { currentUser, showToast, posts } = useApp();
  const navigate = useNavigate();
  const { postId } = useParams<{ postId: string }>();
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [users, setUsers] = useState<Record<string, User>>({});

  useEffect(() => {
    if (!postId) return;
    const q = query(collection(db, `posts/${postId}/comments`), orderBy('createdAt', 'asc'));
    const unsub = onSnapshot(q, snap => {
      const c: Comment[] = [];
      snap.forEach(d => {
        const data = d.data();
        c.push({
          ...data,
          id: d.id,
          createdAt: data.createdAt?.toDate?.() || new Date()
        } as Comment);
      });
      setComments(c);
      
      c.forEach(cm => {
        if (!users[cm.userId]) {
          getDoc(doc(db, 'users', cm.userId)).then(uSnap => {
             if (uSnap.exists()) {
               setUsers(prev => ({...prev, [cm.userId]: uSnap.data() as User}));
             }
          });
        }
      });
    }, error => console.error("Comments error:", error.message));
    return () => unsub();
  }, [postId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim() || !currentUser || !postId) return;
    const cid = `c${Date.now()}`;
    const newComment = {
      id: cid,
      postId,
      userId: currentUser.id,
      text: commentText,
      createdAt: serverTimestamp()
    };
    try {
      await setDoc(doc(db, `posts/${postId}/comments`, cid), newComment);
      setCommentText('');

      const post = posts.find(p => p.id === postId);
      if (post && post.userId !== currentUser.id) {
        const notifId = `nc_${Date.now()}`;
        await setDoc(doc(db, 'notifications', notifId), {
          id: notifId,
          userId: post.userId,
          actorId: currentUser.id,
          type: 'comment',
          postId: post.id,
          read: false,
          createdAt: serverTimestamp()
        });
      }
    } catch (e) {
      console.error(e);
      showToast('failed to post comment');
    }
  };

  return (
    <motion.div initial={{ x: 50, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="flex-1 flex flex-col min-h-0 bg-white dark:bg-black absolute inset-0 z-50">
      <header className="flex items-center justify-between px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black/90 backdrop-blur-md sticky top-0 z-50 shrink-0">
        <button onClick={() => navigate(-1)} className="text-zinc-500 dark:text-zinc-500 dark:text-zinc-400 hover:text-black dark:text-white transition-colors w-8"><ChevronLeft size={24} /></button>
        <span className="font-bold text-lg text-zinc-900 dark:text-zinc-100">Post</span>
        <div className="w-8" />
      </header>
      
      <div className="flex-1 overflow-y-auto w-full p-4 flex flex-col gap-5">
        {(() => {
          const post = posts.find(p => p.id === postId);
          if (post) {
            return (
              <div className="border-b border-zinc-200 dark:border-zinc-800 pb-4 mb-2 -mx-4 px-4 bg-white dark:bg-black">
                <PostItem post={post} />
              </div>
            );
          }
          return null;
        })()}
        {comments.map((cm) => {
          const u = users[cm.userId] || { username: '...', avatar: '', name: '...' };
          return (
            <div key={cm.id} className="flex gap-3">
               <img src={u.avatar || undefined} alt="" className="w-8 h-8 rounded-full bg-zinc-200 dark:bg-zinc-800" />
               <div className="flex-1">
                 <div className="flex items-baseline gap-2">
                   <span className="font-bold text-[13px] text-zinc-900 dark:text-zinc-100">{u.username}</span>
                   <span className="text-[11px] text-zinc-500 dark:text-zinc-500">{formatDistanceToNow(cm.createdAt)}</span>
                 </div>
                 <p className="text-[13px] text-zinc-700 dark:text-zinc-300 mt-1">{cm.text}</p>
               </div>
            </div>
          )
        })}
        {comments.length === 0 && <div className="text-zinc-500 dark:text-zinc-500 text-center mt-10">No comments yet</div>}
      </div>

      <form onSubmit={handleSend} className="px-4 py-3 bg-white dark:bg-black border-t border-zinc-200 dark:border-zinc-800/80 mb-safe shrink-0 flex items-center gap-3">
        <img src={currentUser?.avatar || undefined} alt="" className="w-9 h-9 rounded-full bg-zinc-200 dark:bg-zinc-800" />
        <input 
          type="text" 
          value={commentText}
          onChange={e => setCommentText(e.target.value)}
          placeholder="Add a comment..."
          className="flex-1 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-full px-4 py-2 text-[14px] text-black dark:text-white outline-none placeholder:text-zinc-500 dark:text-zinc-500"
        />
        <button type="submit" disabled={!commentText.trim()} className="text-indigo-400 font-bold px-2 disabled:opacity-50">Post</button>
      </form>
    </motion.div>
  );
};

// --- SCREENS ---
const EditProfileScreen = () => {
  const { currentUser, updateProfile, showToast } = useApp();
  const navigate = useNavigate();
  const [name, setName] = useState(currentUser?.name || '');
  const [username, setUsername] = useState(currentUser?.username || '');
  const [bio, setBio] = useState(currentUser?.bio || '');
  const [avatar, setAvatar] = useState(currentUser?.avatar || '');
  const [isUploading, setIsUploading] = useState(false);

  const handleSave = () => {
    updateProfile({ name, username, bio, avatar });
    showToast('Profile updated!');
    navigate('/profile');
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentUser) return;
    
    setIsUploading(true);
    try {
      const resizedBase64 = await resizeImage(file, 400, 400);
      setAvatar(resizedBase64);
    } catch (error) {
      console.error("Avatar resize error", error);
      showToast('Error resizing avatar');
    }
    setIsUploading(false);
  };

  return (
    <motion.div initial={{ x: 50, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="flex-1 flex flex-col min-h-0 bg-white dark:bg-black absolute inset-0 z-50">
      <header className="flex items-center justify-between px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black/90 backdrop-blur-md sticky top-0 z-10 shrink-0">
        <button onClick={() => navigate(-1)} className="text-zinc-500 dark:text-zinc-500 dark:text-zinc-400 hover:text-black dark:text-white transition-colors"><ChevronLeft size={24} /></button>
        <span className="font-bold text-[15px] tracking-wide text-zinc-900 dark:text-zinc-100">Edit Profile</span>
        <button onClick={handleSave} disabled={isUploading} className="font-bold text-[13px] uppercase tracking-wider text-indigo-400 hover:text-indigo-300 disabled:opacity-50">Save</button>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-6 flex flex-col gap-6">
        <div className="flex flex-col items-center mb-4">
          <img src={avatar || undefined} alt="Profile" className={cn("w-24 h-24 rounded-full bg-zinc-200 dark:bg-zinc-800 object-cover", isUploading && "opacity-50 animate-pulse")} />
          <label className="text-indigo-400 font-bold text-[13px] mt-4 cursor-pointer hover:text-indigo-300">
            {isUploading ? 'Uploading...' : 'Change Photo'}
            <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} disabled={isUploading} />
          </label>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-[12px] uppercase tracking-wider font-bold text-zinc-500 dark:text-zinc-500 px-1">Name</label>
          <div className="bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-3 rounded-xl">
            <input type="text" value={name} onChange={e => setName(e.target.value)} className="bg-transparent w-full outline-none text-black dark:text-white text-[15px]" />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-[12px] uppercase tracking-wider font-bold text-zinc-500 dark:text-zinc-500 px-1">Username</label>
          <div className="bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-3 rounded-xl flex items-center">
            <span className="text-zinc-500 dark:text-zinc-500 mr-1">@</span>
            <input type="text" value={username} onChange={e => setUsername(e.target.value)} className="bg-transparent flex-1 outline-none text-black dark:text-white text-[15px]" />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-[12px] uppercase tracking-wider font-bold text-zinc-500 dark:text-zinc-500 px-1">Bio</label>
          <div className="bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-3 rounded-xl">
            <textarea value={bio} onChange={e => setBio(e.target.value)} className="bg-transparent w-full outline-none text-black dark:text-white text-[15px] resize-none h-24" />
          </div>
        </div>
      </div>
    </motion.div>
  );
};


const FollowListModal = ({ isOpen, onClose, title, users }: { isOpen: boolean, onClose: () => void, title: string, users: User[] }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-zinc-900 w-full max-w-[320px] max-h-[70vh] rounded-2xl shadow-xl flex flex-col relative overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-800">
          <h2 className="font-bold text-[15px]">{title}</h2>
          <button onClick={onClose} className="p-1 rounded-full text-zinc-500 hover:text-black dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
        <div className="overflow-y-auto p-4 flex flex-col gap-3">
          {users.map(u => (
            <Link key={u.id} to={`/${u.username}`} onClick={onClose} className="flex items-center gap-3">
              <img src={u.avatar || undefined} alt="" className="w-10 h-10 rounded-full object-cover bg-zinc-200 dark:bg-zinc-800 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="font-bold text-[14px] truncate">{u.username}</div>
                <div className="text-[12px] text-zinc-500 truncate">{u.name}</div>
              </div>
            </Link>
          ))}
          {users.length === 0 && <div className="text-zinc-500 text-center py-4 text-[13px]">List is empty</div>}
        </div>
      </div>
    </div>
  );
};

const StoryViewerModal = ({ stories, user, onClose }: { stories: Story[], user: User, onClose: () => void }) => {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (index < stories.length - 1) setIndex(index + 1);
      else onClose();
    }, 5000);
    return () => clearTimeout(timer);
  }, [index, stories.length, onClose]);

  const story = stories[index];
  if (!story) return null;

  return (
    <div className="fixed inset-0 z-[200] bg-black flex flex-col animate-in fade-in duration-200">
      <div className="flex gap-1 p-2 absolute top-0 w-full z-10">
        {stories.map((s, i) => (
          <div key={s.id} className="h-1 flex-1 bg-white/30 rounded-full overflow-hidden">
            {i === index && <motion.div initial={{ width: 0 }} animate={{ width: '100%' }} transition={{ duration: 5000, ease: 'linear' }} className="h-full bg-white" />}
            {i < index && <div className="h-full w-full bg-white" />}
          </div>
        ))}
      </div>
      <div className="absolute top-6 left-0 w-full flex items-center justify-between px-4 z-10 text-white">
        <div className="flex items-center gap-2 drop-shadow-md">
          <img src={user.avatar || undefined} className="w-8 h-8 rounded-full border border-white/50" />
          <span className="font-bold text-[13px]">{user.username}</span>
          <span className="text-white/70 text-[11px] font-medium">{formatDistanceToNow(story.createdAt)}</span>
        </div>
        <button onClick={onClose} className="p-2 text-white hover:bg-white/20 rounded-full drop-shadow-md">
           <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>

      <div className="flex-1 relative flex items-center justify-center bg-zinc-900 overflow-hidden mt-12 mb-safe">
        <img src={story.imageUrl} className="w-full h-full object-contain" />
        <div className="absolute inset-0 flex">
           <div className="flex-1 cursor-pointer" onClick={(e) => { e.stopPropagation(); if (index > 0) setIndex(index - 1); }} />
           <div className="flex-1 cursor-pointer" onClick={(e) => { e.stopPropagation(); if (index < stories.length - 1) setIndex(index + 1); else onClose(); }} />
        </div>
      </div>
    </div>
  );
};

const StoriesBar = () => {
  const { showToast, currentUser } = useApp();
  const [storiesByUserId, setStoriesByUserId] = useState<Record<string, Story[]>>({});
  const [storyUsers, setStoryUsers] = useState<Record<string, User>>({});
  const [viewingUserId, setViewingUserId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    // Only get stories from last 24h to avoid client over-fetching, rules enforce validation.
    // Firestore where('expiresAt', '>', date) requires composite index if joining with other orderBys, 
    // so we just query all and filter locally, or orderBy expiresAt.
    const q = query(
      collection(db, 'stories'), 
      where('expiresAt', '>', new Date()),
      orderBy('expiresAt', 'asc') // Needs index: stories, expiresAt ASC
    );
    let backupUnsub: (() => void) | null = null;
    const unsub = onSnapshot(q, snap => {
       const mapped: Record<string, Story[]> = {};
       const usersToFetch = new Set<string>();
       snap.forEach(d => {
         const data = d.data();
         const story = {
            ...data,
            id: d.id,
            createdAt: data.createdAt?.toDate?.() || new Date(),
            expiresAt: data.expiresAt?.toDate?.() || new Date(),
         } as Story;
         if (!mapped[story.userId]) mapped[story.userId] = [];
         mapped[story.userId].push(story);
         usersToFetch.add(story.userId);
       });
       // Sort stories by createdAt just in case
       for (const k in mapped) mapped[k].sort((a,b) => a.createdAt.getTime() - b.createdAt.getTime());
       setStoriesByUserId(mapped);

       // Fetch missing users
       usersToFetch.forEach(uid => {
         if (!storyUsers[uid]) {
           getDoc(doc(db, 'users', uid)).then(uSnap => {
             if (uSnap.exists()) {
               setStoryUsers(prev => ({...prev, [uid]: uSnap.data() as User}));
             }
           });
         }
       });
    }, e => {
      if (e.message.includes('index')) {
        console.warn("Index needed for stories:", e.message);
        // Fallback if index fails: just get all stories created in last 24h
        // Not ideal but works for preview if index creation takes time.
        const backupQ = query(collection(db, 'stories'));
        backupUnsub = onSnapshot(backupQ, backupSnap => {
           const mapped: Record<string, Story[]> = {};
           const now = new Date();
           backupSnap.forEach(d => {
             const data = d.data();
             const exp = data.expiresAt?.toDate?.() || new Date();
             if (exp > now) {
                const story = { ...data, id: d.id, createdAt: data.createdAt?.toDate?.() || new Date(), expiresAt: exp } as Story;
                if (!mapped[story.userId]) mapped[story.userId] = [];
                mapped[story.userId].push(story);
             }
           });
           setStoriesByUserId(mapped);
        }, backupErr => console.error(backupErr));
      }
    });
    return () => {
      unsub();
      if (backupUnsub) backupUnsub();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentUser) return;
    setIsUploading(true);
    try {
      const resizedBase64 = await resizeImage(file, 1080, 1920);
      const storyId = `s${Date.now()}`;
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      await setDoc(doc(db, 'stories', storyId), {
        id: storyId,
        userId: currentUser.id,
        imageUrl: resizedBase64,
        createdAt: serverTimestamp(),
        expiresAt: Timestamp.fromDate(expiresAt),
      });
      showToast('Story added!');
    } catch (err: unknown) {
      console.error(err);
      showToast('Failed to add story');
    }
    setIsUploading(false);
  };

  const userIdsWithStories = Object.keys(storiesByUserId).filter(id => id !== currentUser?.id);
  const myStories = currentUser ? storiesByUserId[currentUser.id] : undefined;

  return (
    <>
      <div className="w-full border-b border-zinc-200 dark:border-zinc-800/50 pb-3 pt-4 mb-2">
        <div className="flex px-4 items-start gap-4 overflow-x-auto hide-scrollbar">
          <label className={cn("flex flex-col items-center gap-1.5 shrink-0 transition-opacity", isUploading && "opacity-50", myStories ? "cursor-pointer" : "cursor-pointer")} onClick={(e) => {
             if (myStories && myStories.length > 0) {
                e.preventDefault(); // allow click on "Your story" image to open
                setViewingUserId(currentUser!.id);
             }
          }}>
            <div className="relative">
              <img src={currentUser?.avatar || undefined} alt="Your story" className="w-16 h-16 rounded-full bg-zinc-200 dark:bg-zinc-800 object-cover" />
              <div className="absolute bottom-0 right-0 bg-indigo-500 rounded-full border-2 border-white dark:border-black w-5 h-5 flex items-center justify-center shadow-sm">
                <PlusSquare size={12} className="text-white relative z-10" />
                {!myStories && <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-20" onChange={handleUpload} disabled={isUploading} />}
              </div>
            </div>
            <span className="text-[11px] text-zinc-500 dark:text-zinc-500 dark:text-zinc-400">Your story</span>
          </label>
          
          {userIdsWithStories.map(uid => {
             const u = storyUsers[uid];
             if (!u) return null;
             return (
               <div key={uid} className="flex flex-col items-center gap-1.5 shrink-0 cursor-pointer group" onClick={() => setViewingUserId(uid)}>
                  <div className="w-[68px] h-[68px] rounded-full bg-gradient-to-tr from-yellow-500 via-rose-500 to-indigo-500 flex items-center justify-center p-[2px] group-hover:scale-105 transition-transform duration-300 shadow-sm">
                    <img src={u.avatar || undefined} alt={u.username} className="w-[60px] h-[60px] rounded-full bg-zinc-200 dark:bg-zinc-800 border-2 border-white dark:border-black object-cover" />
                  </div>
                  <span className="text-[11px] text-zinc-700 dark:text-zinc-300 max-w-[70px] truncate">{u.username}</span>
               </div>
             );
          })}
        </div>
      </div>
      {viewingUserId && <StoryViewerModal stories={storiesByUserId[viewingUserId]} user={viewingUserId === currentUser?.id ? currentUser : storyUsers[viewingUserId]} onClose={() => setViewingUserId(null)} />}
    </>
  );
};

const FeedScreen = () => {
  const { posts, followingIds, currentUser, showToast, theme, setTheme } = useApp();
  
  const sortedPosts = React.useMemo(() => {
    return [...posts].sort((a, b) => {
      const aFollowed = followingIds.includes(a.userId) || a.userId === currentUser?.id;
      const bFollowed = followingIds.includes(b.userId) || b.userId === currentUser?.id;
      if (aFollowed && !bFollowed) return -1;
      if (!aFollowed && bFollowed) return 1;
      // if same, sort by date desc
      return b.createdAt.getTime() - a.createdAt.getTime();
    });
  }, [posts, followingIds, currentUser]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 flex flex-col min-h-0 bg-white dark:bg-black">
      <header className="px-5 py-4 flex justify-between items-center border-b border-zinc-200 dark:border-zinc-800 sticky top-0 bg-white/90 dark:bg-black/90 backdrop-blur-md z-40 shrink-0">
        <span className="font-bold text-xl italic text-zinc-900 dark:text-zinc-100">FineWord</span>
        <div className="flex gap-4 items-center">
          <button 
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} 
            className="text-zinc-700 dark:text-zinc-300 hover:text-black dark:hover:text-white transition-colors"
          >
            {theme === 'light' ? <Moon size={22} /> : <Sun size={22} />}
          </button>
          <Link to="/notifications"><Heart size={24} className="text-zinc-700 dark:text-zinc-300 hover:text-black dark:hover:text-white transition-colors" /></Link>
          <Link to="/chat"><MessageCircle size={24} className="text-zinc-700 dark:text-zinc-300 hover:text-black dark:hover:text-white transition-colors" /></Link>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto divide-y divide-zinc-900/50 pb-6">
        <StoriesBar />
        {sortedPosts.map((post) => (
          <PostItem key={post.id} post={post} />
        ))}
      </div>
    </motion.div>
  );
};

const NotificationsScreen = () => {
  const { notifications, currentUser } = useApp();
  const navigate = useNavigate();
  const [actors, setActors] = useState<Record<string, User>>({});

  useEffect(() => {
    const fetchActors = async () => {
      const newActors = { ...actors };
      let changed = false;
      for (const n of notifications) {
        if (!newActors[n.actorId] && n.actorId !== currentUser?.id) {
          try {
            const snap = await getDoc(doc(db, 'users', n.actorId));
            if (snap.exists()) {
              newActors[n.actorId] = snap.data() as User;
              changed = true;
            }
          } catch(e) {}
        }
      }
      if (changed) setActors(newActors);
    };
    fetchActors();
  }, [notifications, currentUser]);

  const handleRead = (n: Notification) => {
    if (!n.read) {
      updateDoc(doc(db, 'notifications', n.id), { read: true });
    }
    if (n.postId) {
      navigate(`/post/${n.postId}/comments`);
    } else if (n.type === 'follow') {
      const actor = actors[n.actorId];
      if (actor) navigate(`/${actor.username}`);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 flex flex-col min-h-0 bg-white dark:bg-black">
      <header className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 sticky top-0 bg-white/90 dark:bg-black/90 backdrop-blur-md z-40 shrink-0">
        <span className="font-bold text-xl text-zinc-900 dark:text-zinc-100">Notifications</span>
      </header>
      <div className="flex-1 overflow-y-auto pb-6">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-10 h-full text-center text-zinc-500">
            <Heart size={48} className="mb-4 opacity-50" />
            <p>No notifications yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-100 dark:divide-zinc-900">
            {notifications.map(n => {
              const actor = actors[n.actorId] || { name: 'Someone', avatar: '' };
              return (
                <div 
                  key={n.id} 
                  onClick={() => handleRead(n)}
                  className={cn("flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors", !n.read && "bg-indigo-50/50 dark:bg-indigo-900/10")}
                >
                  <img src={actor.avatar} alt="" className="w-10 h-10 rounded-full bg-zinc-200 dark:bg-zinc-800" />
                  <div className="flex-1 text-[14px]">
                    <span className="font-semibold text-zinc-900 dark:text-zinc-100 mr-1">{actor.name}</span>
                    <span className="text-zinc-600 dark:text-zinc-400">
                      {n.type === 'like' && 'liked your post.'}
                      {n.type === 'comment' && 'commented on your post.'}
                      {n.type === 'follow' && 'started following you.'}
                    </span>
                    <div className="text-[12px] text-zinc-500 mt-0.5">
                      {formatDistanceToNow(n.createdAt, { addSuffix: true })}
                    </div>
                  </div>
                  {!n.read && <div className="w-2 h-2 rounded-full bg-indigo-500" />}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
};

const ChatListScreen = () => {
  const { chats, currentUser } = useApp();
  const [chatUsers, setChatUsers] = useState<Record<string, User>>({});
  const navigate = useNavigate();

  const chatUsersRef = React.useRef<Record<string, boolean>>({});

  useEffect(() => {
    chats.forEach(async c => {
      const otherUserId = c.users.find(u => u !== currentUser?.id);
      if (otherUserId && !chatUsersRef.current[otherUserId]) {
        chatUsersRef.current[otherUserId] = true;
        const snap = await getDoc(doc(db, 'users', otherUserId));
        if (snap.exists()) {
          setChatUsers(prev => ({ ...prev, [otherUserId]: snap.data() as User }));
        }
      }
    });
  }, [chats, currentUser]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 flex flex-col min-h-0 bg-white dark:bg-black">
      <header className="px-5 py-5 border-b border-zinc-200 dark:border-zinc-800 sticky top-0 bg-white dark:bg-black/90 backdrop-blur-md z-40 shrink-0 flex items-center justify-between">
        <div className="text-xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">Messages</div>
        <button onClick={() => navigate('/search')} className="p-2 -mr-2 text-zinc-900 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors rounded-full" title="New Chat">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
        </button>
      </header>
      <div className="flex-1 overflow-y-auto w-full pt-2 pb-6">
        {chats.map((chat) => {
          const otherUserId = chat.users.find(u => u !== currentUser?.id);
          const user = otherUserId ? chatUsers[otherUserId] : null;
          if (!user) return null;
          return (
            <Link key={chat.id} to={`/chat/${chat.id}`} className="flex items-center gap-4 px-5 py-3 hover:bg-zinc-100 dark:bg-zinc-900/40 transition-colors w-full group relative">
              <div className="relative shrink-0">
                <img src={user.avatar || undefined} alt="" className="w-14 h-14 rounded-full bg-zinc-200 dark:bg-zinc-800 group-hover:scale-105 transition-transform object-cover" />
                <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-500 border-2 border-white dark:border-black rounded-full" />
              </div>
              <div className="flex-1 min-w-0 flex flex-col justify-center">
                <div className="flex justify-between items-baseline mb-1">
                  <p className="font-bold text-[15px] text-zinc-900 dark:text-zinc-100">{user.name}</p>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-medium whitespace-nowrap ml-2">{formatDistanceToNow(chat.updatedAt)}</p>
                </div>
                <div className={cn("text-[14px] truncate pr-4", currentUser && chat.seenBy && !chat.seenBy.includes(currentUser.id) && chat.lastMessage ? "text-zinc-900 dark:text-zinc-100 font-bold" : "text-zinc-600 dark:text-zinc-400")}>
                  {chat.lastMessage || 'Start a conversation'}
                </div>
              </div>
              {currentUser && chat.seenBy && !chat.seenBy.includes(currentUser.id) && chat.lastMessage && (
                <div className="w-2.5 h-2.5 bg-red-500 rounded-full shrink-0" />
              )}
            </Link>
          );
        })}
        {chats.length === 0 && (
          <div className="flex flex-col items-center justify-center p-10 h-full text-center">
            <div className="w-20 h-20 bg-zinc-100 dark:bg-zinc-900 rounded-full flex items-center justify-center mb-6">
               <svg className="w-10 h-10 text-zinc-400 dark:text-zinc-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            </div>
            <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-2">Your Messages</h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6 max-w-[240px]">Connect with friends or groups, direct messages will appear here.</p>
            <button onClick={() => navigate('/search')} className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 px-6 rounded-full text-[14px] transition-colors">Start a Chat</button>
          </div>
        )}
      </div>
    </motion.div>
  );
};

const ChatRoomScreen = () => {
  const { chats, sendMessage, currentUser } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const chatId = location.pathname.split('/').pop() || '';
  const chat = chats.find(c => c.id === chatId);
  
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [text, setText] = useState('');
  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (!chat || !currentUser) return;
    const otherUserId = chat.users.find(u => u !== currentUser.id);
    if (otherUserId) {
      getDoc(doc(db, 'users', otherUserId)).then(snap => {
        if (snap.exists()) setUser(snap.data() as User);
      });
    }
  }, [chat, currentUser]);

  useEffect(() => {
    if (!chatId || !chat) return;
    if (currentUser && (!chat.seenBy || !chat.seenBy.includes(currentUser.id))) {
      updateDoc(doc(db, 'chats', chatId), {
        seenBy: Array.from(new Set([...(chat.seenBy || []), currentUser.id]))
      }).catch(e => {
        console.error("Firestore Error on updating seenBy: ", e.message, `Path chats/${chatId}`);
      });
    }
    const q = query(collection(db, `chats/${chatId}/messages`), orderBy('createdAt', 'asc'));
    const unsub = onSnapshot(q, snap => {
      const msgs: Message[] = [];
      snap.forEach(d => {
        const data = d.data();
        msgs.push({
          ...data,
          id: d.id,
          createdAt: data.createdAt?.toDate?.() || new Date()
        } as Message);
      });
      setChatMessages(msgs);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }, error => console.error("Messages error:", error.message));
    return () => unsub();
  }, [chatId, chat]);

  if (!chat) return <div className="p-5 flex justify-center items-center h-full text-zinc-500 dark:text-zinc-500">Wait...</div>;
  if (!user) return <div className="p-5 flex justify-center items-center h-full text-zinc-500 dark:text-zinc-500">Loading user...</div>;

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    sendMessage(chatId, text);
    setText('');
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  return (
    <motion.div initial={{ x: 50, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="flex-1 flex flex-col min-h-0 bg-white dark:bg-black absolute inset-0 z-50">
      <header className="flex items-center px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black/90 backdrop-blur-md sticky top-0 z-10 shrink-0">
        <button onClick={() => navigate(-1)} className="mr-3 p-1.5 rounded-full text-zinc-500 dark:text-zinc-400 hover:text-black dark:text-white hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"><ChevronLeft size={24} /></button>
        <Link to={`/${user.username}`} className="flex items-center gap-3 flex-1 group min-w-0">
          <div className="relative shrink-0">
             <img src={user.avatar || undefined} alt="" className="w-10 h-10 rounded-full bg-zinc-200 dark:bg-zinc-800 object-cover group-hover:scale-105 transition-transform" />
             <div className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-white dark:border-black rounded-full" />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-[15px] text-zinc-900 dark:text-zinc-100 leading-tight mb-0.5 truncate">{user.name}</p>
            <p className="text-[12px] font-medium text-zinc-500 dark:text-zinc-400 truncate">@{user.username}</p>
          </div>
        </Link>
      </header>
      
      <div className="flex-1 overflow-y-auto px-4 pt-6 pb-6 flex flex-col">
        {chatMessages.map((msg, index) => {
          const isMe = msg.senderId === currentUser?.id;
          const prevMsg = chatMessages[index - 1];
          const nextMsg = chatMessages[index + 1];
          
          const isSameSenderAsPrev = prevMsg && prevMsg.senderId === msg.senderId;
          const isSameSenderAsNext = nextMsg && nextMsg.senderId === msg.senderId;
          
          const showDateHeader = !prevMsg || !isSameDay(msg.createdAt, prevMsg.createdAt);
          const needsAvatarSpace = !isMe && !isSameSenderAsNext;

          return (
            <React.Fragment key={msg.id}>
              {showDateHeader && (
                <div className="flex justify-center my-6">
                  <span className="text-[11px] font-bold text-zinc-500 dark:text-zinc-500 uppercase tracking-widest bg-zinc-100 dark:bg-zinc-900 px-3 py-1 rounded-full">
                    {format(msg.createdAt, 'MMM d, yyyy')}
                  </span>
                </div>
              )}
              <div className={cn("flex items-end gap-2", !isSameSenderAsPrev ? "mt-2" : "mt-0.5", isMe ? "justify-end" : "justify-start")}>
                {!isMe && (
                  <div className="w-8 shrink-0">
                    {needsAvatarSpace && (
                      <Link to={`/${user.username}`}>
                        <img src={user.avatar || undefined} className="w-8 h-8 rounded-full bg-zinc-200 dark:bg-zinc-800 object-cover" />
                      </Link>
                    )}
                  </div>
                )}
                <div className={cn("flex flex-col group max-w-[75%]", isMe ? "items-end" : "items-start")}>
                  <div className={cn(
                    "px-4 py-2.5 text-[15px] leading-relaxed relative", 
                    msg.imageUrl ? "p-1 rounded-2xl overflow-hidden bg-transparent border-0" :
                    (isMe ? "bg-indigo-600 text-white shadow-sm" : "bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm"),
                    // Border radiuses for grouping
                    !msg.imageUrl && "rounded-2xl",
                    !msg.imageUrl && isMe && isSameSenderAsNext && "rounded-br-md",
                    !msg.imageUrl && isMe && isSameSenderAsPrev && "rounded-tr-md",
                    !msg.imageUrl && !isMe && isSameSenderAsNext && "rounded-bl-md",
                    !msg.imageUrl && !isMe && isSameSenderAsPrev && "rounded-tl-md"
                  )}>
                    {msg.imageUrl ? (
                      <img src={msg.imageUrl} className="rounded-xl w-full max-w-[240px] max-h-[300px] object-cover" />
                    ) : (
                      msg.text
                    )}
                  </div>
                  <span className={cn(
                    "text-[10px] text-zinc-400 dark:text-zinc-600 font-medium px-1 mt-1 transition-opacity opacity-0 group-hover:opacity-100 absolute",
                    isMe ? "-left-12 bottom-2" : "-right-12 bottom-2"
                  )}>
                    {format(msg.createdAt, 'h:mm a')}
                  </span>
                </div>
              </div>
            </React.Fragment>
          );
        })}
        <div ref={messagesEndRef} className="pt-2" />
      </div>

      <form onSubmit={handleSend} className="px-4 py-3 bg-white dark:bg-black border-t border-zinc-200 dark:border-zinc-800 mb-safe shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-full flex-1 flex items-center pr-2 pl-4 py-2">
            <input 
              type="text"
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Message..."
              className="bg-transparent flex-1 outline-none py-1 text-[15px] placeholder:text-zinc-500 dark:text-zinc-500 text-black dark:text-white"
            />
            <label className="p-1.5 rounded-full text-zinc-500 dark:text-zinc-400 hover:text-indigo-500 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors cursor-pointer shrink-0">
              <ImageIcon size={20} />
              <input type="file" className="hidden" accept="image/*" onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) {
                  try {
                    const dataUrl = await resizeImage(f, 800, 800);
                    sendMessage(chatId, '', dataUrl);
                  } catch(e) {
                    // ignore
                  }
                }
              }} />
            </label>
          </div>
          <button 
            type="submit" 
            disabled={!text.trim()}
            className="w-10 h-10 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-200 dark:disabled:bg-zinc-800 disabled:text-zinc-400 text-white rounded-full flex items-center justify-center transition-colors shrink-0"
          >
            <Send size={18} className={cn(!text.trim() && "ml-0", text.trim() && "ml-1")} />
          </button>
        </div>
      </form>
    </motion.div>
  );
};

const SearchScreen = () => {
  const [queryText, setQueryText] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const { currentUser, posts } = useApp();
  const [tab, setTab] = useState<'users'|'posts'>('users');

  useEffect(() => {
    if (!queryText.trim() || tab !== 'users') {
      setUsers([]);
      return;
    }
    const q = query(
      collection(db, 'users'), 
      where('username', '>=', queryText.toLowerCase()),
      where('username', '<', queryText.toLowerCase() + '\uf8ff')
    );
    const unsub = onSnapshot(q, snap => {
      const u: User[] = [];
      snap.forEach(d => {
        if (d.id !== currentUser?.id) {
          u.push(d.data() as User);
        }
      });
      setUsers(u);
    }, error => console.error("Users search error:", error.message));
    return () => unsub();
  }, [queryText, currentUser, tab]);

  const matchedPosts = tab === 'posts' && queryText.trim() 
    ? posts.filter(p => p.caption?.toLowerCase().includes(queryText.toLowerCase()))
    : [];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 flex flex-col min-h-0 bg-white dark:bg-black">
      <header className="px-5 py-5 border-b border-zinc-200 dark:border-zinc-800 sticky top-0 bg-white dark:bg-black/90 backdrop-blur-md z-40 shrink-0">
        <h1 className="font-bold text-[15px] tracking-wide text-zinc-900 dark:text-zinc-100">Explore</h1>
      </header>
      <div className="flex-1 overflow-y-auto w-full">
        <div className="p-5 pb-2 sticky top-0 bg-white dark:bg-black z-10 w-full shrink-0">
          <div className="w-full bg-zinc-100 dark:bg-zinc-900/50 rounded-xl px-4 py-3 flex items-center gap-3 border border-zinc-200 dark:border-zinc-800">
            <Search size={20} className="text-zinc-500 dark:text-zinc-500 shrink-0" />
            <input 
              type="text" 
              placeholder={`Search ${tab}...`} 
              value={queryText}
              onChange={e => setQueryText(e.target.value)}
              className="bg-transparent border-none outline-none text-black dark:text-white w-full placeholder:text-zinc-600 min-w-0"
            />
          </div>
          <div className="flex gap-4 mt-4 px-1 border-b border-zinc-200 dark:border-zinc-800/50 w-full overflow-x-auto hide-scrollbar shrink-0">
            <button onClick={() => setTab('users')} className={cn("pb-2 px-1 text-[13px] font-bold tracking-wide uppercase transition-colors shrink-0", tab === 'users' ? "border-b-2 border-indigo-500 text-indigo-500" : "text-zinc-500")}>Users</button>
            <button onClick={() => setTab('posts')} className={cn("pb-2 px-1 text-[13px] font-bold tracking-wide uppercase transition-colors shrink-0", tab === 'posts' ? "border-b-2 border-indigo-500 text-indigo-500" : "text-zinc-500")}>Posts</button>
          </div>
        </div>
        <div className="flex flex-col w-full min-w-0">
          {tab === 'users' ? (
            <div className="flex flex-col gap-4 p-5">
              {users.map(u => (
                <Link key={u.id} to={`/${u.username}`} className="flex items-center gap-4 bg-zinc-100 dark:bg-zinc-900/30 p-3 rounded-2xl hover:bg-zinc-100 dark:bg-zinc-900/50 transition-colors w-full break-inside-avoid shrink-0">
                   <img src={u.avatar || undefined} alt="" className="w-12 h-12 rounded-full object-cover bg-zinc-200 dark:bg-zinc-800 shrink-0" />
                   <div className="min-w-0 flex-1">
                      <div className="font-bold text-black dark:text-white text-[14px] truncate">{u.username}</div>
                      <div className="text-zinc-500 dark:text-zinc-500 text-[12px] truncate">{u.name}</div>
                   </div>
                </Link>
              ))}
              {queryText.trim() && users.length === 0 && (
                 <div className="text-center text-zinc-500 dark:text-zinc-500 mt-10">No users found</div>
              )}
            </div>
          ) : (
            <div className="flex flex-col w-full min-w-0 pb-6 shrink-0 divide-y divide-zinc-200 dark:divide-zinc-800">
               {matchedPosts.map(post => <PostItem key={post.id} post={post} />)}
               {queryText.trim() && matchedPosts.length === 0 && (
                 <div className="text-center text-zinc-500 dark:text-zinc-500 mt-10">No posts found</div>
               )}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

const CreatePostScreen = () => {
  const { currentUser, showToast } = useApp();
  const navigate = useNavigate();
  const [caption, setCaption] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentUser) return;
    
    setIsUploading(true);
    try {
      const resizedBase64 = await resizeImage(file, 800, 800);
      setImageUrl(resizedBase64);
    } catch (error) {
      console.error("Upload error", error);
      showToast('Error parsing image');
    }
    setIsUploading(false);
  };

  const handleCreate = async () => {
    if ((!caption.trim() && !imageUrl) || !currentUser) return;
    setIsUploading(true);
    const postId = `p${Date.now()}`;
    const newPost = {
      id: postId,
      userId: currentUser.id,
      imageUrl,
      caption: caption.trim(),
      likes: 0,
      likedBy: [],
      createdAt: serverTimestamp(),
    };
    try {
      await setDoc(doc(db, 'posts', postId), newPost);
      navigate('/');
    } catch (e) {
      console.error(e);
      showToast('Error creating post');
    }
  };

  const canSubmit = (!!imageUrl || !!caption.trim()) && !isUploading;

  return (
    <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="flex-1 flex flex-col min-h-0 bg-white dark:bg-black">
      <header className="flex items-center justify-between px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 shrink-0 bg-white dark:bg-black/90 backdrop-blur-md sticky top-0 z-10">
        <button onClick={() => navigate(-1)} className="text-zinc-500 dark:text-zinc-500 dark:text-zinc-400 hover:text-black dark:text-white transition-colors"><ChevronLeft size={24} /></button>
        <span className="font-bold text-lg text-zinc-900 dark:text-zinc-100">New Post</span>
        <button onClick={handleCreate} className={cn("font-bold text-[13px] uppercase tracking-wider text-indigo-400 transition-opacity", !canSubmit ? "opacity-30" : "hover:text-indigo-300")} disabled={!canSubmit}>Share</button>
      </header>
      
      <div className="flex-1 overflow-y-auto flex flex-col p-4">
        <div className="flex gap-4 items-start pb-4 border-b border-zinc-200 dark:border-zinc-800/50 mb-4 shrink-0">
          <img src={currentUser?.avatar || undefined} alt="" className="w-10 h-10 rounded-full bg-zinc-200 dark:bg-zinc-800 object-cover shrink-0" />
          <textarea
            value={caption}
            onChange={e => setCaption(e.target.value)}
            placeholder="Write a caption... (optional if you add an image)"
            className="bg-transparent flex-1 resize-none outline-none text-[15px] min-h-[100px] border-none text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 dark:text-zinc-500 font-medium pt-2"
            autoFocus
          />
        </div>

        {!imageUrl ? (
          <div className="flex-1 flex items-start justify-center">
            <label className="flex flex-col w-full aspect-video bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors rounded-2xl items-center justify-center gap-4 cursor-pointer border-dashed border-2">
              <input 
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleUpload}
                disabled={isUploading}
              />
              {isUploading ? (
                 <span className="text-zinc-500 dark:text-zinc-500 font-bold uppercase tracking-widest text-[14px] animate-pulse">Processing...</span>
              ) : (
                 <>
                   <ImageIcon size={32} className="text-zinc-400 dark:text-zinc-600"/>
                   <span className="text-zinc-600 dark:text-zinc-400 font-medium tracking-tight text-[14px]">Attach Photo (Optional)</span>
                 </>
              )}
            </label>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
             <div className="w-full bg-zinc-100 dark:bg-zinc-900 relative rounded-2xl overflow-hidden shadow-sm border border-zinc-200 dark:border-zinc-800">
               <img src={imageUrl} alt="Preview" className="w-full h-auto object-cover max-h-[60vh] mx-auto" />
               <label className="absolute bottom-4 right-4 bg-white dark:bg-black/70 backdrop-blur-md px-3 py-1.5 rounded-full text-black dark:text-white text-[12px] font-bold cursor-pointer hover:bg-white dark:hover:bg-black/90 transition-colors flex items-center gap-2 border border-zinc-200 dark:border-zinc-800 shadow-sm">
                  <ImageIcon size={14} /> Change Photo
                  <input type="file" accept="image/*" className="hidden" onChange={handleUpload} disabled={isUploading} />
               </label>
               <button onClick={() => setImageUrl('')} className="absolute top-4 right-4 bg-white dark:bg-black/70 backdrop-blur-md w-8 h-8 rounded-full flex items-center justify-center text-black dark:text-white border border-zinc-200 dark:border-zinc-800 shadow-sm hover:scale-105 transition-transform flex-shrink-0">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
               </button>
             </div>
          </div>
        )}
      </div>
    </motion.div>
  );
};

const UserProfileScreen = () => {
  const { posts, showToast, currentUser } = useApp();
  const { username } = useParams<{ username: string }>();
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [followerIds, setFollowerIds] = useState<string[]>([]);
  const [followingIds, setFollowingIds] = useState<string[]>([]);
  const [isFollowing, setIsFollowing] = useState(false);
  const [loadingFollow, setLoadingFollow] = useState(false);

  const [modalType, setModalType] = useState<'followers'|'following'|null>(null);
  const [modalUsers, setModalUsers] = useState<User[]>([]);

  useEffect(() => {
    if (username) {
      const qUser = query(collection(db, 'users'), where('username', '==', username));
      getDocs(qUser).then(d => {
        if (!d.empty) {
          const u = d.docs[0].data() as User;
          setUser(u);
          setUserId(u.id);
        }
      });
    }
  }, [username]);

  useEffect(() => {
    if (userId) {
      const qFollowers = query(collection(db, 'follows'), orderBy('followerId'));
      const unsubFollowers = onSnapshot(qFollowers, (snap) => {
        const f1: string[] = []; const f2: string[] = []; let isF = false;
        snap.forEach(d => {
          const dt = d.data();
          if (dt.followingId === userId) f1.push(dt.followerId);
          if (dt.followerId === userId) f2.push(dt.followingId);
          if (dt.followingId === userId && dt.followerId === currentUser?.id) isF = true;
        });
        setFollowerIds(f1);
        setFollowingIds(f2);
        setIsFollowing(isF);
      }, (e) => console.error("Follows error B:", e.message));
      return () => unsubFollowers();
    }
  }, [userId, currentUser]);

  const fetchModalUsers = async (type: 'followers'|'following') => {
    setModalType(type);
    const ids = type === 'followers' ? followerIds : followingIds;
    if (ids.length === 0) {
      setModalUsers([]);
      return;
    }
    try {
      const usersSnap = await Promise.all(ids.map(id => getDoc(doc(db, 'users', id))));
      setModalUsers(usersSnap.map(s => s.data() as User).filter(Boolean));
    } catch {
      showToast('Error fetching users');
    }
  };

  const handleFollowToggle = async () => {
    if (!currentUser || !userId || loadingFollow) return;
    setLoadingFollow(true);
    const followId = `${currentUser.id}_${userId}`;
    try {
      if (isFollowing) {
        // Unfollow
        const ref = doc(db, 'follows', followId);
        const { deleteDoc } = await import('firebase/firestore');
        await deleteDoc(ref);
      } else {
        // Follow
        await setDoc(doc(db, 'follows', followId), {
          id: followId,
          followerId: currentUser.id,
          followingId: userId,
          createdAt: serverTimestamp()
        });

        const notifId = `nf_${Date.now()}`;
        await setDoc(doc(db, 'notifications', notifId), {
          id: notifId,
          userId: userId,
          actorId: currentUser.id,
          type: 'follow',
          read: false,
          createdAt: serverTimestamp()
        });
      }
    } catch (e) {
      console.error(e);
      showToast('Error toggling follow');
    }
    setLoadingFollow(false);
  };

  const handleMessage = async () => {
     if (!currentUser || !userId) return;
     // Check if chat exists
     // Sorting to make consistent chat ID
     const users = [currentUser.id, userId].sort();
     const chatId = `${users[0]}_${users[1]}`;
     try {
       const chatSnap = await getDoc(doc(db, 'chats', chatId));
       if (!chatSnap.exists()) {
           await setDoc(doc(db, 'chats', chatId), {
               id: chatId,
               users,
               lastMessage: '',
               updatedAt: serverTimestamp(),
               seenBy: [currentUser.id]
           });
       }
       navigate(`/chat/${chatId}`);
     } catch (e) {
       console.error(e);
       showToast('Error creating chat');
     }
  };

  if (!user) return <div className="flex-1 bg-white dark:bg-black flex items-center justify-center text-zinc-500 dark:text-zinc-500">Loading...</div>;

  const userPosts = posts.filter(p => p.userId === userId);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 flex flex-col min-h-0 bg-white dark:bg-black">
      <header className="flex items-center justify-between px-5 py-5 border-b border-zinc-200 dark:border-zinc-800 sticky top-0 bg-white dark:bg-black/90 backdrop-blur-md z-40 shrink-0">
        <button onClick={() => navigate(-1)} className="text-zinc-500 dark:text-zinc-500 dark:text-zinc-400 hover:text-black dark:text-white transition-colors w-6 flex justify-start">
          <ChevronLeft size={24} />
        </button>
        <span className="font-bold text-[15px] tracking-wide text-zinc-900 dark:text-zinc-100">@{user.username}</span>
        <div className="w-6" />
      </header>
      
      <div className="flex-1 overflow-y-auto">
        <div className="p-6 flex items-center justify-between">
          <div className="relative shrink-0">
             <img src={user.avatar || undefined} alt="Profile" className="w-20 sm:w-24 h-20 sm:h-24 rounded-full bg-zinc-200 dark:bg-zinc-800 object-cover" />
             <div className="absolute inset-0 rounded-full ring-2 ring-indigo-500/30 ring-offset-4 ring-offset-white dark:ring-offset-black"></div>
          </div>
          <div className="flex gap-4 sm:gap-7 pr-2 text-center">
            <div className="flex flex-col items-center"><span className="font-bold text-lg sm:text-xl">{userPosts.length}</span><span className="text-[10px] text-zinc-500 dark:text-zinc-500 uppercase tracking-widest mt-1">Posts</span></div>
            <div className="flex flex-col items-center cursor-pointer hover:opacity-70" onClick={() => fetchModalUsers('followers')}><span className="font-bold text-lg sm:text-xl">{followerIds.length}</span><span className="text-[10px] text-zinc-500 dark:text-zinc-500 uppercase tracking-widest mt-1">Followers</span></div>
            <div className="flex flex-col items-center cursor-pointer hover:opacity-70" onClick={() => fetchModalUsers('following')}><span className="font-bold text-lg sm:text-xl">{followingIds.length}</span><span className="text-[10px] text-zinc-500 dark:text-zinc-500 uppercase tracking-widest mt-1">Following</span></div>
          </div>
        </div>
        
        <div className="px-6 pb-6 border-b border-zinc-200 dark:border-zinc-800/50">
          <h2 className="font-bold text-[15px] text-zinc-900 dark:text-zinc-100">{user.name}</h2>
          <p className="text-[14px] mt-2 text-zinc-700 dark:text-zinc-300 leading-relaxed max-w-[90%] break-words">{user.bio}</p>
          {currentUser?.id !== userId && (
            <div className="mt-6 flex gap-3">
              <button onClick={handleFollowToggle} disabled={loadingFollow} className={cn("flex-1 py-2.5 rounded-xl text-[12px] uppercase tracking-widest font-bold transition-all text-center", isFollowing ? 'bg-zinc-200 dark:bg-zinc-800 text-black dark:text-white hover:bg-zinc-300 dark:hover:bg-zinc-700' : 'bg-indigo-600 hover:bg-indigo-500 text-white')}>
                 {isFollowing ? 'Following' : 'Follow'}
              </button>
              <button onClick={handleMessage} className="flex-1 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-800 py-2.5 rounded-xl text-[12px] text-black dark:text-white uppercase tracking-widest font-bold transition-all text-center">Message</button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-0.5 sm:gap-1 p-0.5 sm:px-1 bg-white dark:bg-black">
          {userPosts.length === 0 ? (
            <div className="col-span-3 py-16 flex flex-col items-center justify-center text-zinc-500 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-900/30 rounded-xl m-4 border border-zinc-200 dark:border-zinc-800/50 block">
              <ImageIcon size={48} className="mb-4 opacity-40" />
              <p className="text-[13px] font-medium">No posts compiled yet</p>
            </div>
          ) : (
            userPosts.map(post => (
              <div key={post.id} className="pt-[100%] bg-zinc-100 dark:bg-zinc-900 relative group cursor-pointer overflow-hidden border border-zinc-200 dark:border-zinc-800" onClick={() => navigate(`/post/${post.id}/comments`)}>
                {post.imageUrl ? (
                  <>
                    <img src={post.imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    <div className="absolute inset-0 bg-white/0 dark:bg-black/0 group-hover:bg-white/20 dark:group-hover:bg-black/20 transition-colors" />
                  </>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center p-2 text-center text-[10px] sm:text-xs font-medium italic overflow-hidden break-words">{post.caption}</div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
      <FollowListModal isOpen={modalType !== null} onClose={() => setModalType(null)} title={modalType === 'followers' ? 'Followers' : 'Following'} users={modalUsers} />
    </motion.div>
  );
};

const ProfileScreen = () => {
  const { posts, showToast, currentUser, logout } = useApp();
  const navigate = useNavigate();
  const myPosts = posts.filter(p => p.userId === currentUser?.id);
  const [followerIds, setFollowerIds] = useState<string[]>([]);
  const [followingIds, setFollowingIds] = useState<string[]>([]);
  const [modalType, setModalType] = useState<'followers'|'following'|null>(null);
  const [modalUsers, setModalUsers] = useState<User[]>([]);

  useEffect(() => {
    if (currentUser?.id) {
       const qFollowers = query(collection(db, 'follows'), orderBy('followerId'));
       const unsubFollowers = onSnapshot(qFollowers, (snap) => {
         const f1: string[] = []; const f2: string[] = [];
         snap.forEach(d => {
           const dt = d.data();
           if (dt.followingId === currentUser.id) f1.push(dt.followerId);
           if (dt.followerId === currentUser.id) f2.push(dt.followingId);
         });
         setFollowerIds(f1);
         setFollowingIds(f2);
       }, (e) => console.error("Follows error A:", e.message));
       return () => unsubFollowers();
    }
  }, [currentUser]);

  const fetchModalUsers = async (type: 'followers'|'following') => {
    setModalType(type);
    const ids = type === 'followers' ? followerIds : followingIds;
    if (ids.length === 0) {
      setModalUsers([]);
      return;
    }
    try {
      const usersSnap = await Promise.all(ids.map(id => getDoc(doc(db, 'users', id))));
      setModalUsers(usersSnap.map(s => s.data() as User).filter(Boolean));
    } catch {
      showToast('Error fetching users');
    }
  };

  if (!currentUser) return null;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 flex flex-col min-h-0 bg-white dark:bg-black">
      <header className="flex items-center justify-between px-5 py-5 border-b border-zinc-200 dark:border-zinc-800 sticky top-0 bg-white dark:bg-black/90 backdrop-blur-md z-40 shrink-0">
        <div className="w-6" />
        <span className="font-bold text-[15px] tracking-wide text-zinc-900 dark:text-zinc-100">@{currentUser.username}</span>
        <button onClick={logout} className="text-rose-500 hover:text-rose-400 transition-colors w-6 flex justify-end">
          <LogOut size={20} />
        </button>
      </header>
      
      <div className="flex-1 overflow-y-auto">
        <div className="p-6 flex items-center justify-between">
          <div className="relative shrink-0">
             <img src={currentUser.avatar || undefined} alt="Profile" className="w-20 sm:w-24 h-20 sm:h-24 rounded-full bg-zinc-200 dark:bg-zinc-800 object-cover" />
             <div className="absolute inset-0 rounded-full ring-2 ring-indigo-500/30 ring-offset-4 ring-offset-white dark:ring-offset-black"></div>
          </div>
          <div className="flex gap-4 sm:gap-7 pr-2 text-center">
            <div className="flex flex-col items-center"><span className="font-bold text-lg sm:text-xl">{myPosts.length}</span><span className="text-[10px] text-zinc-500 dark:text-zinc-500 uppercase tracking-widest mt-1">Posts</span></div>
            <div className="flex flex-col items-center cursor-pointer hover:opacity-70" onClick={() => fetchModalUsers('followers')}><span className="font-bold text-lg sm:text-xl">{followerIds.length}</span><span className="text-[10px] text-zinc-500 dark:text-zinc-500 uppercase tracking-widest mt-1">Followers</span></div>
            <div className="flex flex-col items-center cursor-pointer hover:opacity-70" onClick={() => fetchModalUsers('following')}><span className="font-bold text-lg sm:text-xl">{followingIds.length}</span><span className="text-[10px] text-zinc-500 dark:text-zinc-500 uppercase tracking-widest mt-1">Following</span></div>
          </div>
        </div>
        
        <div className="px-6 pb-6 border-b border-zinc-200 dark:border-zinc-800/50">
          <h2 className="font-bold text-[15px] text-zinc-900 dark:text-zinc-100">{currentUser.name}</h2>
          <p className="text-[14px] mt-2 text-zinc-700 dark:text-zinc-300 leading-relaxed max-w-[90%] break-words">{currentUser.bio}</p>
          <div className="mt-6 flex gap-3">
            <button onClick={() => navigate('/profile/edit')} className="flex-1 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-200 dark:bg-zinc-800 py-2.5 rounded-xl text-[12px] uppercase tracking-widest font-bold transition-all text-center text-zinc-700 dark:text-zinc-300 hover:text-black dark:text-white">Edit profile</button>
            <button onClick={() => {
              navigator.clipboard.writeText(window.location.href);
              showToast('Profile link copied!');
            }} className="flex-1 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-200 dark:bg-zinc-800 py-2.5 rounded-xl text-[12px] uppercase tracking-widest font-bold transition-all text-center text-zinc-700 dark:text-zinc-300 hover:text-black dark:text-white">Share profile</button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-0.5 sm:gap-1 p-0.5 sm:px-1 bg-white dark:bg-black">
          {myPosts.length === 0 ? (
            <div className="col-span-3 py-16 flex flex-col items-center justify-center text-zinc-500 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-900/30 rounded-xl m-4 border border-zinc-200 dark:border-zinc-800/50 block">
              <ImageIcon size={48} className="mb-4 opacity-40" />
              <p className="text-[13px] font-medium">No posts compiled yet</p>
            </div>
          ) : (
            myPosts.map(post => (
              <div key={post.id} className="pt-[100%] bg-zinc-100 dark:bg-zinc-900 relative group cursor-pointer overflow-hidden border border-zinc-200 dark:border-zinc-800" onClick={() => navigate(`/post/${post.id}/comments`)}>
                {post.imageUrl ? (
                  <>
                    <img src={post.imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    <div className="absolute inset-0 bg-white/0 dark:bg-black/0 group-hover:bg-white/20 dark:group-hover:bg-black/20 transition-colors" />
                  </>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center p-2 text-center text-[10px] sm:text-xs font-medium italic overflow-hidden break-words">{post.caption}</div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
      <FollowListModal isOpen={modalType !== null} onClose={() => setModalType(null)} title={modalType === 'followers' ? 'Followers' : 'Following'} users={modalUsers} />
    </motion.div>
  );
};

// --- APP ROOT ------ APP ROOT ---

const AuthScreen = () => {
  const [loading, setLoading] = useState(false);
  const handleLogin = async () => {
    setLoading(true);
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (e) {
      console.error(e);
      setLoading(false);
    }
  };
  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-white dark:bg-black p-6 h-full relative z-[200]">
      <h1 className="text-4xl font-bold italic text-black dark:text-white mb-2 font-sans tracking-tight">FineWord</h1>
      <p className="text-zinc-500 dark:text-zinc-500 dark:text-zinc-400 mb-8 text-center max-w-[260px] text-[14px] leading-relaxed">Sign in to connect with friends and share moments instantly.</p>
      <button onClick={handleLogin} disabled={loading} className="w-full max-w-[280px] bg-white text-black font-bold py-3.5 rounded-xl text-[14px] flex items-center justify-center gap-3 active:scale-95 transition-transform hover:bg-zinc-100 disabled:opacity-70 disabled:scale-100">
        <svg width="18" height="18" viewBox="0 0 48 48">
          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
        </svg>
        {loading ? 'WAIT...' : 'CONTINUE WITH GOOGLE'}
      </button>
    </div>
  );
};

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [posts, setPosts] = useState<Post[]>(INITIAL_POSTS);
  const [chats, setChats] = useState<Chat[]>(INITIAL_CHATS);
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [followingIds, setFollowingIds] = useState<string[]>([]);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  useEffect(() => {
    return onAuthStateChanged(auth, async (user: FirebaseUser | null) => {
      if (user) {
        const userRef = doc(db, 'users', user.uid);
        try {
          const userSnap = await getDoc(userRef);
          if (userSnap.exists()) {
            setCurrentUser(userSnap.data() as User);
          } else {
            const newUser: User = {
              id: user.uid,
              username: user.email?.split('@')[0] || 'user',
              name: user.displayName || 'User',
              avatar: user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`,
              bio: 'Welcome to FineWord'
            };
            await setDoc(userRef, newUser);
            setCurrentUser(newUser);
          }
        } catch (e) {
          console.error("Error fetching user profile:", e);
          setCurrentUser({
            id: user.uid,
            username: user.email?.split('@')[0] || 'user',
            name: user.displayName || 'User',
            avatar: user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`,
            bio: 'Welcome to FineWord'
          });
        }
      } else {
        setCurrentUser(null);
      }
      setIsAuthChecking(false);
    });
  }, []);

  useEffect(() => {
    if (!currentUser) {
      setPosts([]);
      return;
    }
    const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const dbPosts: Post[] = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        dbPosts.push({
          ...data,
          id: doc.id,
          createdAt: data.createdAt?.toDate?.() || new Date(),
        } as Post);
      });
      setPosts(dbPosts);
    }, (error) => {
      console.error("Posts fetch error:", error.message);
    });
    return unsubscribe;
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) {
      setChats([]);
      return;
    }
    const q = query(collection(db, 'chats'), where('users', 'array-contains', currentUser.id));
    const unsub = onSnapshot(q, snap => {
      const dbChats: Chat[] = [];
      snap.forEach(d => {
        const data = d.data();
        dbChats.push({
          ...data,
          id: d.id,
          updatedAt: data.updatedAt?.toDate?.() || new Date()
        } as Chat);
      });
      setChats(dbChats.sort((a,b) => b.updatedAt.getTime() - a.updatedAt.getTime()));
    }, error => console.error("Chats fetch error:", error.message));
    return () => unsub();
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) {
      setNotifications([]);
      setFollowingIds([]);
      return;
    }
    const qNotif = query(collection(db, 'notifications'), where('userId', '==', currentUser.id), orderBy('createdAt', 'desc'));
    const unsubNotif = onSnapshot(qNotif, snap => {
      const notes: Notification[] = [];
      snap.forEach(d => {
        const data = d.data();
        notes.push({
          ...data,
          id: d.id,
          createdAt: data.createdAt?.toDate?.() || new Date()
        } as Notification);
      });
      setNotifications(notes);
    }, e => console.error("Notifs error:", e.message));

    const qFollows = query(collection(db, 'follows'), where('followerId', '==', currentUser.id));
    const unsubFollows = onSnapshot(qFollows, snap => {
      const follows: string[] = [];
      snap.forEach(d => follows.push(d.data().followingId));
      setFollowingIds(follows);
    }, e => console.error("Follows error:", e.message));

    return () => { unsubNotif(); unsubFollows(); };
  }, [currentUser]);

  const updateProfile = async (updates: Partial<User>) => {
    if (!currentUser) return;
    const newProfile = { ...currentUser, ...updates };
    setCurrentUser(newProfile);
    try {
      await updateDoc(doc(db, 'users', currentUser.id), updates);
    } catch (e) {
      console.error("Error updating profile", e);
    }
  };

  const logout = async () => {
    await signOut(auth);
  };

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const toggleLike = async (postId: string) => {
    if (!currentUser) return;
    const post = posts.find(p => p.id === postId);
    if (!post) return;
    
    // Optimistic UI update
    const isLiked = post.likedBy.includes(currentUser.id);
    const newLikedBy = isLiked ? post.likedBy.filter(id => id !== currentUser.id) : [...post.likedBy, currentUser.id];
    setPosts(prev => prev.map(p => {
      if (p.id === postId) {
        return { ...p, likedBy: newLikedBy, likes: newLikedBy.length };
      }
      return p;
    }));

    try {
      await updateDoc(doc(db, 'posts', postId), {
        likes: newLikedBy.length,
        likedBy: newLikedBy
      });
      if (!isLiked && post.userId !== currentUser.id) {
        const notifId = `n_${Date.now()}`;
        await setDoc(doc(db, 'notifications', notifId), {
          id: notifId,
          userId: post.userId,
          actorId: currentUser.id,
          type: 'like',
          postId: post.id,
          read: false,
          createdAt: serverTimestamp()
        });
      }
    } catch (e) {
      console.error("Error toggling like", e);
      showToast('Error liking post');
      // Revert in real app
    }
  };

  const sendMessage = async (chatId: string, text: string, imageUrl?: string) => {
    if (!currentUser) return;
    const msgId = `m${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const newMsg: any = {
      id: msgId,
      chatId,
      senderId: currentUser.id,
      text: text || '',
      createdAt: serverTimestamp(),
    };
    if (imageUrl) newMsg.imageUrl = imageUrl;
    try {
      await setDoc(doc(db, `chats/${chatId}/messages`, msgId), newMsg);
      await updateDoc(doc(db, 'chats', chatId), {
        lastMessage: text || (imageUrl ? 'Sent an image' : ''),
        updatedAt: serverTimestamp(),
        seenBy: [currentUser.id]
      });
    } catch (e) {
      console.error(e);
      showToast('Error sending message');
    }
  };

  const updatePost = async (postId: string, newCaption: string) => {
    try {
      await updateDoc(doc(db, 'posts', postId), { caption: newCaption });
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, caption: newCaption } : p));
    } catch (e) {
      console.error("Error updating post", e);
      showToast('Error updating post');
    }
  };

  const deletePost = async (postId: string) => {
    try {
      await deleteDoc(doc(db, 'posts', postId));
      setPosts(prev => prev.filter(p => p.id !== postId));
    } catch (e) {
      console.error("Error deleting post", e);
      showToast('Error deleting post');
    }
  };

  return (
    <AppContext.Provider value={{ currentUser, logout, updateProfile, posts, setPosts, updatePost, deletePost, chats, messages, setMessages, notifications, followingIds, toggleLike, sendMessage, showToast, theme, setTheme }}>
      {/* 
        This wrapper mimics a mobile app layout on desktop (max-width + centered)
        and stays full-screen on actual mobile. Uses the Sleek design theme.
      */}
      <div className="min-h-[100dvh] h-[100dvh] bg-zinc-100 dark:bg-[#0a0a0b] text-black dark:text-white font-sans flex items-center justify-center p-0 sm:p-8">
        <div className="w-full h-full sm:h-[85vh] sm:max-h-[850px] max-w-[420px] bg-white dark:bg-black sm:border-[6px] sm:border-zinc-200 dark:border-zinc-800 sm:rounded-[3rem] shadow-2xl relative flex flex-col overflow-hidden">
          
          <AnimatePresence>
            {toastMsg && (
              <motion.div
                initial={{ opacity: 0, y: -20, x: '-50%' }}
                animate={{ opacity: 1, y: 0, x: '-50%' }}
                exit={{ opacity: 0, y: -20, x: '-50%' }}
                className="absolute top-12 left-1/2 z-[200] bg-zinc-200 dark:bg-zinc-800 text-black dark:text-white text-[13px] font-bold tracking-wide px-4 py-2 rounded-full shadow-lg border border-zinc-700 whitespace-nowrap"
              >
                {toastMsg}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="hidden sm:flex h-6 w-full justify-center items-end pb-1 absolute top-0 z-[100] pointer-events-none">
            <div className="w-16 h-4 bg-zinc-200 dark:bg-zinc-800 rounded-full"></div>
          </div>
          
          {isAuthChecking ? (
            <div className="flex-1 flex justify-center items-center bg-white dark:bg-black"><span className="text-zinc-500 dark:text-zinc-500 font-bold tracking-widest uppercase text-xs">Loading...</span></div>
          ) : !currentUser ? (
            <AuthScreen />
          ) : (
            <BrowserRouter>
              <div className="flex-1 flex flex-col min-h-0 relative w-full pt-safe sm:pt-6">
                <AnimatePresence mode="wait">
                  <Routes>
                    <Route path="/" element={<FeedScreen />} />
                    <Route path="/notifications" element={<NotificationsScreen />} />
                    <Route path="/search" element={<SearchScreen />} />
                    <Route path="/create" element={<CreatePostScreen />} />
                    <Route path="/chat" element={<ChatListScreen />} />
                    <Route path="/chat/:id" element={<ChatRoomScreen />} />
                    <Route path="/post/:postId/comments" element={<CommentsScreen />} />
                    <Route path="/profile" element={<ProfileScreen />} />
                    <Route path="/profile/edit" element={<EditProfileScreen />} />
                    <Route path="/:username" element={<UserProfileScreen />} />
                  </Routes>
                </AnimatePresence>
              </div>
              <BottomNav />
            </BrowserRouter>
          )}
        </div>
      </div>
    </AppContext.Provider>
  );
}
