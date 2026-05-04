# Flutter Social Media App - Setup & Code

This document contains the complete file structure and implementation for your Flutter + Firebase social media app.

## 1. Setup Instructions

1. **Initialize Flutter Project:**
   ```bash
   flutter create social_app
   cd social_app
   ```

2. **Add Dependencies `pubspec.yaml`:**
   ```yaml
   dependencies:
     flutter:
       sdk: flutter
     firebase_core: ^2.24.2
     firebase_auth: ^4.15.3
     cloud_firestore: ^4.13.6
     firebase_storage: ^11.5.6
     cached_network_image: ^3.3.0
     image_picker: ^1.0.4
     provider: ^6.1.1
     intl: ^0.18.1
   ```
   Run `flutter pub get`.

3. **Firebase Setup:**
   - Go to [Firebase Console](https://console.firebase.google.com/).
   - Create a new project.
   - Run `flutterfire configure` in your terminal to connect your Flutter app to Firebase automatically for iOS and Android.
   - Enable **Authentication** (Email/Password).
   - Enable **Firestore Database** and **Storage** (update security rules to allow read/write for authenticated users).

---

## 2. File Structure

```
lib/
 ââ main.dart
 ââ models/
 â   ââ user_model.dart
 â   ââ post_model.dart
 â   ââ message_model.dart
 ââ screens/
 â   ââ auth/
 â   â   ââ login_screen.dart
 â   â   ââ signup_screen.dart
 â   ââ home/
 â   â   ââ feed_screen.dart
 â   â   ââ profile_screen.dart
 â   â   ââ create_post_screen.dart
 â   ââ chat/
 â       ââ chat_list_screen.dart
 â       ââ chat_room_screen.dart
 ââ services/
     ââ auth_service.dart
     ââ firestore_service.dart
     ââ storage_service.dart
```

---

## 3. Core Implementation

### `lib/main.dart`
```dart
import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'screens/auth/login_screen.dart';
import 'screens/home/feed_screen.dart';
import 'screens/home/profile_screen.dart';
import 'screens/chat/chat_list_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp();
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});
  
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Social App',
      theme: ThemeData(
        brightness: Brightness.dark,
        primaryColor: Colors.blueAccent,
        scaffoldBackgroundColor: Colors.black,
        bottomNavigationBarTheme: const BottomNavigationBarThemeData(
          backgroundColor: Colors.black,
          selectedItemColor: Colors.white,
          unselectedItemColor: Colors.grey,
        ),
      ),
      home: StreamBuilder<User?>(
        stream: FirebaseAuth.instance.authStateChanges(),
        builder: (context, snapshot) {
          if (snapshot.hasData) {
            return const MainTabScreen();
          }
          return const LoginScreen();
        },
      ),
    );
  }
}

class MainTabScreen extends StatefulWidget {
  const MainTabScreen({super.key});
  @override
  State<MainTabScreen> createState() => _MainTabScreenState();
}

class _MainTabScreenState extends State<MainTabScreen> {
  int _currentIndex = 0;
  final List<Widget> _screens = [
    const FeedScreen(),
    const ChatListScreen(),
    const ProfileScreen(),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: _screens[_currentIndex],
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _currentIndex,
        onTap: (index) => setState(() => _currentIndex = index),
        items: const [
          BottomNavigationBarItem(icon: Icon(Icons.home), label: 'Home'),
          BottomNavigationBarItem(icon: Icon(Icons.chat), label: 'Chat'),
          BottomNavigationBarItem(icon: Icon(Icons.person), label: 'Profile'),
        ],
      ),
    );
  }
}
```

### `lib/models/post_model.dart`
```dart
import 'package:cloud_firestore/cloud_firestore.dart';

class Post {
  final String id;
  final String userId;
  final String username;
  final String userImage;
  final String imageUrl;
  final String caption;
  final List<String> likes;
  final DateTime createdAt;

  Post({
    required this.id,
    required this.userId,
    required this.username,
    required this.userImage,
    required this.imageUrl,
    required this.caption,
    required this.likes,
    required this.createdAt,
  });

  factory Post.fromDocument(DocumentSnapshot doc) {
    var data = doc.data() as Map<String, dynamic>;
    return Post(
      id: doc.id,
      userId: data['userId'] ?? '',
      username: data['username'] ?? '',
      userImage: data['userImage'] ?? '',
      imageUrl: data['imageUrl'] ?? '',
      caption: data['caption'] ?? '',
      likes: List<String>.from(data['likes'] ?? []),
      createdAt: (data['createdAt'] as Timestamp).toDate(),
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'userId': userId,
      'username': username,
      'userImage': userImage,
      'imageUrl': imageUrl,
      'caption': caption,
      'likes': likes,
      'createdAt': Timestamp.fromDate(createdAt),
    };
  }
}
```

### `lib/screens/home/feed_screen.dart`
```dart
import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../../models/post_model.dart';
import 'create_post_screen.dart';

class FeedScreen extends StatelessWidget {
  const FeedScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Social App'),
        backgroundColor: Colors.black,
        actions: [
          IconButton(
            icon: const Icon(Icons.add_box_outlined),
            onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const CreatePostScreen())),
          ),
        ],
      ),
      body: StreamBuilder<QuerySnapshot>(
        stream: FirebaseFirestore.instance
            .collection('posts')
            .orderBy('createdAt', descending: true)
            .snapshots(),
        builder: (context, snapshot) {
          if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());
          
          return ListView.builder(
            itemCount: snapshot.data!.docs.length,
            itemBuilder: (context, index) {
              Post post = Post.fromDocument(snapshot.data!.docs[index]);
              return PostItem(post: post);
            },
          );
        },
      ),
    );
  }
}

class PostItem extends StatelessWidget {
  final Post post;
  const PostItem({super.key, required this.post});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ListTile(
          leading: CircleAvatar(backgroundImage: CachedNetworkImageProvider(post.userImage)),
          title: Text(post.username, style: const TextStyle(fontWeight: FontWeight.bold)),
        ),
        CachedNetworkImage(
          imageUrl: post.imageUrl,
          width: double.infinity,
          fit: BoxFit.cover,
        ),
        Padding(
          padding: const EdgeInsets.all(8.0),
          child: Row(
            children: [
              IconButton(icon: const Icon(Icons.favorite_border), onPressed: () {}),
              IconButton(icon: const Icon(Icons.comment), onPressed: () {}),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16.0),
          child: Text('${post.likes.length} likes', style: const TextStyle(fontWeight: FontWeight.bold)),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 4.0),
          child: RichText(
            text: TextSpan(
              style: const TextStyle(color: Colors.white),
              children: [
                TextSpan(text: '${post.username} ', style: const TextStyle(fontWeight: FontWeight.bold)),
                TextSpan(text: post.caption),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
```

### `lib/screens/chat/chat_room_screen.dart`
```dart
import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';

class ChatRoomScreen extends StatefulWidget {
  final String chatId;
  final String otherUsername;
  
  const ChatRoomScreen({super.key, required this.chatId, required this.otherUsername});

  @override
  State<ChatRoomScreen> createState() => _ChatRoomScreenState();
}

class _ChatRoomScreenState extends State<ChatRoomScreen> {
  final TextEditingController _messageController = TextEditingController();
  final String currentUserId = FirebaseAuth.instance.currentUser!.uid;

  void sendMessage() async {
    if (_messageController.text.trim().isEmpty) return;
    
    await FirebaseFirestore.instance
        .collection('chats')
        .doc(widget.chatId)
        .collection('messages')
        .add({
      'senderId': currentUserId,
      'text': _messageController.text,
      'createdAt': FieldValue.serverTimestamp(),
    });
    
    _messageController.clear();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.otherUsername)),
      body: Column(
        children: [
          Expanded(
            child: StreamBuilder<QuerySnapshot>(
              stream: FirebaseFirestore.instance
                  .collection('chats')
                  .doc(widget.chatId)
                  .collection('messages')
                  .orderBy('createdAt', descending: true)
                  .snapshots(),
              builder: (context, snapshot) {
                if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());
                
                return ListView.builder(
                  reverse: true,
                  itemCount: snapshot.data!.docs.length,
                  itemBuilder: (context, index) {
                    var msg = snapshot.data!.docs[index];
                    bool isMe = msg['senderId'] == currentUserId;
                    
                    return Align(
                      alignment: isMe ? Alignment.centerRight : Alignment.centerLeft,
                      child: Container(
                        margin: const EdgeInsets.symmetric(vertical: 4, horizontal: 8),
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: isMe ? Colors.blueAccent : Colors.grey[800],
                          borderRadius: BorderRadius.circular(16),
                        ),
                        child: Text(msg['text'], style: const TextStyle(color: Colors.white)),
                      ),
                    );
                  },
                );
              },
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(8.0),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _messageController,
                    decoration: const InputDecoration(
                      hintText: 'Type a message...',
                      border: OutlineInputBorder(borderRadius: BorderRadius.all(Radius.circular(20))),
                    ),
                  ),
                ),
                IconButton(icon: const Icon(Icons.send), onPressed: sendMessage),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
```

*Note: You can implement the standard Firebase structure for Login, Signup, creating posts, and modifying User Profile inside the remaining files using `FirebaseAuth` and `FirebaseFirestore.instance` respectively.*
