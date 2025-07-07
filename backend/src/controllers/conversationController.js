import { createClient } from '@supabase/supabase-js';

// Helper function to create authenticated Supabase client
const createAuthenticatedSupabase = (jwt) => {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${jwt}`
      }
    }
  });
};

// Helper function to get JWT from request headers
const getJwtFromHeaders = (headers) => {
  return headers.authorization?.replace('Bearer ', '') || '';
};

export const conversationController = {
  // Simplified methods for direct use by AI route
  async createThread(userId, title, summary, jwt = null) {
    try {
      // Use service role key to bypass RLS policies
      const supabase = createClient(
        process.env.SUPABASE_URL, 
        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
      );

      const { data: thread, error } = await supabase
        .from('conversation_threads')
        .insert({
          user_id: userId,
          title: title,
          summary: summary || null
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating conversation thread:', error);
        throw new Error('Failed to create conversation thread');
      }

      return thread;
    } catch (error) {
      console.error('Conversation thread creation error:', error);
      throw error;
    }
  },

  async getThreads(userId) {
    try {
      // Use service role key to bypass RLS policies
      const supabase = createClient(
        process.env.SUPABASE_URL, 
        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
      );

      const { data: threads, error } = await supabase
        .from('conversation_threads')
        .select(`
          *,
          conversation_messages (
            id,
            role,
            content,
            created_at
          )
        `)
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('updated_at', { ascending: false });

      if (error) {
        console.error('Error fetching conversation threads:', error);
        throw new Error('Failed to fetch conversation threads');
      }

      // Add message count and last message info to each thread
      const threadsWithStats = threads.map(thread => {
        const messages = thread.conversation_messages || [];
        const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
        
        return {
          ...thread,
          message_count: messages.length,
          last_message: lastMessage ? {
            content: lastMessage.content.substring(0, 100) + (lastMessage.content.length > 100 ? '...' : ''),
            role: lastMessage.role,
            created_at: lastMessage.created_at
          } : null,
          conversation_messages: undefined // Remove the full messages array to reduce payload
        };
      });

      return threadsWithStats;
    } catch (error) {
      console.error('Error fetching conversation threads:', error);
      throw error;
    }
  },

  async getThread(threadId, userId) {
    try {
      // Use service role key to bypass RLS policies
      const supabase = createClient(
        process.env.SUPABASE_URL, 
        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
      );

      // First, verify the thread belongs to the user
      const { data: thread, error: threadError } = await supabase
        .from('conversation_threads')
        .select('*')
        .eq('id', threadId)
        .eq('user_id', userId)
        .single();

      if (threadError || !thread) {
        return null;
      }

      // Get all messages for this thread
      const { data: messages, error: messagesError } = await supabase
        .from('conversation_messages')
        .select('*')
        .eq('thread_id', threadId)
        .order('created_at', { ascending: true });

      if (messagesError) {
        console.error('Error fetching conversation messages:', messagesError);
        throw new Error('Failed to fetch conversation messages');
      }

      return {
        thread,
        messages: messages || []
      };
    } catch (error) {
      console.error('Error fetching conversation thread:', error);
      throw error;
    }
  },

  async addMessage(threadId, content, role, metadata, jwt = null) {
    try {
      // Use service role key to bypass RLS policies
      const supabase = createClient(
        process.env.SUPABASE_URL, 
        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
      );

      // Get the user_id from the thread
      const { data: thread, error: threadError } = await supabase
        .from('conversation_threads')
        .select('user_id')
        .eq('id', threadId)
        .single();

      if (threadError || !thread) {
        throw new Error('Conversation thread not found');
      }

      // Insert the message
      const { data: message, error: messageError } = await supabase
        .from('conversation_messages')
        .insert({
          thread_id: threadId,
          user_id: thread.user_id,
          role,
          content,
          metadata: metadata || null
        })
        .select()
        .single();

      if (messageError) {
        console.error('Error adding message:', messageError);
        throw new Error('Failed to add message');
      }

      // Update the thread's updated_at timestamp
      await supabase
        .from('conversation_threads')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', threadId);

      return message;
    } catch (error) {
      console.error('Error adding message:', error);
      throw error;
    }
  },

  async updateThread(threadId, userId, updates) {
    try {
      // Use service role key to bypass RLS policies
      const supabase = createClient(
        process.env.SUPABASE_URL, 
        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
      );

      // Verify the thread belongs to the user
      const { data: thread, error: threadError } = await supabase
        .from('conversation_threads')
        .select('id')
        .eq('id', threadId)
        .eq('user_id', userId)
        .single();

      if (threadError || !thread) {
        return null;
      }

      // Update the thread
      const { data: updatedThread, error: updateError } = await supabase
        .from('conversation_threads')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', threadId)
        .select()
        .single();

      if (updateError) {
        console.error('Error updating conversation thread:', updateError);
        throw new Error('Failed to update conversation thread');
      }

      return updatedThread;
    } catch (error) {
      console.error('Error updating conversation thread:', error);
      throw error;
    }
  },

  async deleteThread(threadId, userId) {
    try {
      // Use service role key to bypass RLS policies
      const supabase = createClient(
        process.env.SUPABASE_URL, 
        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
      );

      // Verify the thread belongs to the user
      const { data: thread, error: threadError } = await supabase
        .from('conversation_threads')
        .select('id')
        .eq('id', threadId)
        .eq('user_id', userId)
        .single();

      if (threadError || !thread) {
        return false;
      }

      // Soft delete by setting is_active to false
      const { error: deleteError } = await supabase
        .from('conversation_threads')
        .update({ 
          is_active: false,
          updated_at: new Date().toISOString()
        })
        .eq('id', threadId);

      if (deleteError) {
        console.error('Error deleting conversation thread:', deleteError);
        throw new Error('Failed to delete conversation thread');
      }

      return true;
    } catch (error) {
      console.error('Error deleting conversation thread:', error);
      throw error;
    }
  },

  // Express-style methods for backward compatibility
  async createThreadExpress(req, res) {
    try {
      const { title, summary } = req.body;
      const userId = req.user.id;
      const token = req.headers.authorization?.replace('Bearer ', '');

      if (!title) {
        return res.status(400).json({ error: 'Thread title is required' });
      }

      const thread = await conversationController.createThread(userId, title, summary, token);
      res.status(201).json(thread);
    } catch (error) {
      console.error('Conversation thread creation error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async getThreadsExpress(req, res) {
    try {
      const userId = req.user.id;
      const threads = await conversationController.getThreads(userId);
      res.json(threads);
    } catch (error) {
      console.error('Error fetching conversation threads:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async getThreadExpress(req, res) {
    try {
      const { threadId } = req.params;
      const userId = req.user.id;

      const thread = await conversationController.getThread(threadId, userId);
      if (!thread) {
        return res.status(404).json({ error: 'Conversation thread not found' });
      }

      res.json(thread);
    } catch (error) {
      console.error('Error fetching conversation thread:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async addMessageExpress(req, res) {
    try {
      const { threadId } = req.params;
      const { content, role, metadata } = req.body;
      const token = req.headers.authorization?.replace('Bearer ', '');

      if (!content || !role) {
        return res.status(400).json({ error: 'Message content and role are required' });
      }

      if (!['user', 'assistant'].includes(role)) {
        return res.status(400).json({ error: 'Role must be either "user" or "assistant"' });
      }

      const message = await conversationController.addMessage(threadId, content, role, metadata, token);
      res.status(201).json(message);
    } catch (error) {
      console.error('Error adding message:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async updateThreadExpress(req, res) {
    try {
      const { threadId } = req.params;
      const { title, summary } = req.body;
      const userId = req.user.id;

      const updatedThread = await conversationController.updateThread(threadId, userId, { title, summary });
      if (!updatedThread) {
        return res.status(404).json({ error: 'Conversation thread not found' });
      }

      res.json(updatedThread);
    } catch (error) {
      console.error('Error updating conversation thread:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async deleteThreadExpress(req, res) {
    try {
      const { threadId } = req.params;
      const userId = req.user.id;

      const deleted = await conversationController.deleteThread(threadId, userId);
      if (!deleted) {
        return res.status(404).json({ error: 'Conversation thread not found' });
      }

      res.json({ message: 'Thread deleted successfully' });
    } catch (error) {
      console.error('Error deleting conversation thread:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async getStats(req, res) {
    try {
      const userId = req.user.id;
      const token = getJwtFromHeaders(req.headers);

      const supabase = createAuthenticatedSupabase(token);

      // Get total threads
      const { count: totalThreads, error: threadsError } = await supabase
        .from('conversation_threads')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_active', true);

      if (threadsError) {
        console.error('Error fetching thread stats:', threadsError);
        return res.status(500).json({ error: 'Failed to fetch thread statistics' });
      }

      // Get total messages
      const { count: totalMessages, error: messagesError } = await supabase
        .from('conversation_messages')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

      if (messagesError) {
        console.error('Error fetching message stats:', messagesError);
        return res.status(500).json({ error: 'Failed to fetch message statistics' });
      }

      res.json({
        total_threads: totalThreads || 0,
        total_messages: totalMessages || 0
      });
    } catch (error) {
      console.error('Error fetching conversation stats:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}; 