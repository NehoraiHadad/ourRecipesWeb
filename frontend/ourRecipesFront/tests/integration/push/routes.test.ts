import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({ auth:vi.fn(), register:vi.fn(), schedule:vi.fn() }));
vi.mock('@/lib/auth',()=>({ requireAuth:mocks.auth, authErrorResponse:()=>Response.json({error:'unauthorized'},{status:401}) }));
vi.mock('@/lib/timers/push/store',()=>({ registerTimerSubscription:mocks.register }));
vi.mock('@/lib/timers/push/schedule',()=>({ scheduleServerTimer:mocks.schedule }));
import { POST } from '@/app/api/push/subscriptions/route';
import { PUT } from '@/app/api/push/timers/[id]/route';
import { GET } from '@/app/api/push/config/route';
const request=(path:string,body:unknown,origin='https://recipes.example')=>new Request(`https://recipes.example${path}`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
beforeEach(()=>{
  vi.clearAllMocks();mocks.auth.mockResolvedValue({ok:true,session:{sub:'owner-1'}});
  vi.stubEnv('TIMER_PUSH_ENABLED','true');vi.stubEnv('TIMER_PUSH_PUBLIC_KEY','public');vi.stubEnv('TIMER_PUSH_PRIVATE_KEY','private');vi.stubEnv('TIMER_PUSH_SUBJECT','https://recipes.example');
});
describe('timer Push HTTP boundaries',()=>{
 it('exposes only the public key and availability',async()=>{
  expect(await GET().json()).toEqual({enabled:true,publicKey:'public'});
  vi.stubEnv('TIMER_PUSH_PRIVATE_KEY','');expect(await GET().json()).toEqual({enabled:false,publicKey:null});
 });
 it('rejects cross-origin cookie writes before calling storage',async()=>{
  const response=await POST(request('/api/push/subscriptions',{},'https://evil.example'));
  expect(response.status).toBe(403);expect(mocks.register).not.toHaveBeenCalled();
 });
 it('requires a signed-in session',async()=>{
  mocks.auth.mockResolvedValue({ok:false});expect((await POST(request('/api/push/subscriptions',{}))).status).toBe(401);
 });
 it('rejects endpoints that could be used to request arbitrary servers',async()=>{
  const response=await POST(request('/api/push/subscriptions',{endpoint:'https://127.0.0.1/private',keys:{p256dh:'B'.repeat(87),auth:'A'.repeat(22)}}));
  expect(response.status).toBe(400);expect(mocks.register).not.toHaveBeenCalled();
 });
 it('uses the authenticated owner, ignoring any caller-supplied owner',async()=>{
  mocks.register.mockResolvedValue('subscription-id');
  const body={endpoint:'https://fcm.googleapis.com/fcm/send/a',keys:{p256dh:'B'.repeat(87),auth:'A'.repeat(22)},ownerId:'other'};
  expect((await POST(request('/api/push/subscriptions',body))).status).toBe(200);
  expect(mocks.register.mock.calls[0][0]).toBe('owner-1');expect(mocks.register.mock.calls[0][1]).not.toHaveProperty('ownerId');
 });
 it('keeps cancellation available even when new Push timers are disabled',async()=>{
  vi.stubEnv('TIMER_PUSH_ENABLED','false');mocks.schedule.mockResolvedValue({state:'cancelled',version:2});
  const body={subscriptionId:crypto.randomUUID(),version:2,state:'cancelled',endsAt:null,recipeName:'לחם',description:'התפחה',recipeUrl:'/',muted:false};
  const response=await PUT(request('/api/push/timers/timer-1',body),{params:{id:'timer-1'}});
  expect(response.status).toBe(200);expect(mocks.schedule.mock.calls[0][0]).toBe('owner-1');
 });
});
