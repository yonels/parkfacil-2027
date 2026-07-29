"use client";
import { createClient } from "@supabase/supabase-js";
let client;
export function getSupabaseBrowserClient(){if(!client)client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);return client;}
export async function authenticatedFetch(url,options={}){const {data}=await getSupabaseBrowserClient().auth.getSession();const token=data.session?.access_token;if(!token)throw new Error("Debes iniciar sesión para continuar.");return fetch(url,{...options,headers:{...(options.headers||{}),Authorization:`Bearer ${token}`}});}
