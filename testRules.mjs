import { readFileSync } from 'fs';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';

async function run() {
  const testEnv = await initializeTestEnvironment({
    projectId: 'demo-test',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
    },
  });

  const alice = testEnv.authenticatedContext('alice', { email: 'alice@example.com', email_verified: true });
  
  // Try to create a dummy user
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await db.doc('users/alice').set({ id: 'alice', username: 'alice', name: 'Alice', avatar: '', bio: '' });
    await db.doc('users/bob').set({ id: 'bob', username: 'bob', name: 'Bob', avatar: '', bio: '' });
    
    await db.doc('chats/chat1').set({
      id: 'chat1',
      users: ['alice', 'bob'],
      lastMessage: '',
      updatedAt: new Date(),
    });
  });

  const dbAlice = alice.firestore();
  
  try {
    await dbAlice.doc('chats/chat1').update({
      seenBy: ['alice']
    });
    console.log("UPDATE SEENBY SUCCESS");
  } catch(e) {
    console.log("UPDATE SEENBY FAILED", e.message);
  }

  try {
    await dbAlice.doc('chats/chat1/messages/msg1').set({
      id: 'msg1',
      chatId: 'chat1',
      senderId: 'alice',
      text: 'hello',
      createdAt: new Date()
    });
    console.log("CREATE MESSAGE SUCCESS");
  } catch (e) {
    console.log("CREATE MESSAGE FAILED", e.message);
  }
}

run();
