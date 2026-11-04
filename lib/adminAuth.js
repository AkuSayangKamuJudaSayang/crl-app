import {getPortalUser} from './portalAuth';
export const adminProfileSelect = { profilePhoto:true, id: true, username: true, fullName: true, firstName: true, lastName: true, middleName: true, nameSuffix: true, role: true, section: true, schoolId: true, schoolName: true, createdAt: true };
export async function getAdminUser(request){return getPortalUser(request,'admin');}
