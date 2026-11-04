import {NextResponse} from 'next/server';
import {registerAccount} from '../../../../lib/registerAccount';
import {createAuthToken,setAuthCookie,serializeAuthUser} from '../../../../lib/auth';
import {enforceSensitiveRate} from '../../../../lib/security';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function POST(request){try{const body=await request.json();const limited=await enforceSensitiveRate(request,'register',body);if(limited)return limited;const user=await registerAccount(body,'teacher');return setAuthCookie(NextResponse.json({status:'ok',user:serializeAuthUser(user)},{status:201,headers:{'Cache-Control':'no-store'}}),await createAuthToken(user));}catch(e){return NextResponse.json({error:e.code==='P2002'?'This username or email is already registered.':e.status?e.message:'Unable to create your account.'},{status:e.code==='P2002'?409:e.status||503});}}
