import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import type { Session } from "@supabase/supabase-js";

export interface Profile {
  id: string;
  email: string;
  display_name?: string;
  role: string;
}

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isOffline] = useState(!supabase);

  const fetchProfile = useCallback(async (userId: string, email?: string) => {
    if (!supabase) return;
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();
    if (data) {
      setProfile(data as Profile);
    } else {
      // Profile row doesn't exist yet — create a pending one
      const newProfile: Profile = {
        id: userId,
        email: email || "",
        role: "pending",
      };
      // Insert into Supabase so admin can see it
      await supabase
        .from("profiles")
        .upsert({ id: userId, email: email || "", role: "pending" }, { onConflict: "id" });
      setProfile(newProfile);
    }
  }, []);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    // Get the initial session
    supabase.auth.getSession().then(async ({ data: { session: s } }) => {
      setSession(s);
      if (s?.user) {
        await fetchProfile(s.user.id, s.user.email);
      }
      setLoading(false);
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, s) => {
        setSession(s);
        if (s?.user) {
          fetchProfile(s.user.id, s.user.email);
        } else {
          setProfile(null);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    if (!supabase) throw new Error("Supabase not configured");
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    // Check if user is pending
    if (data.user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .single();
      if (profile?.role === "pending") {
        await supabase.auth.signOut();
        throw new Error("Your account is pending administrator approval.");
      }
    }
  }, []);

  const signUpWithEmail = useCallback(async (email: string, password: string) => {
    if (!supabase) throw new Error("Supabase not configured");
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    // Create pending profile
    if (data.user) {
      await supabase
        .from("profiles")
        .upsert({ id: data.user.id, email, role: "pending" }, { onConflict: "id" });
    }
    // Sign out immediately — user must wait for admin approval
    await supabase.auth.signOut();
    throw new Error("Account created! Please wait for administrator approval before signing in.");
  }, []);

  const signInWithMicrosoft = useCallback(async () => {
    if (!supabase) throw new Error("Supabase not configured");
    const { error } = await supabase.auth.signInWithOAuth({ provider: "azure" });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
  }, []);

  const isAdmin = profile?.role === "admin";

  return {
    session,
    profile,
    loading,
    isAdmin,
    isOffline,
    signInWithEmail,
    signUpWithEmail,
    signInWithMicrosoft,
    signOut,
  };
}
