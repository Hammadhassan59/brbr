export type StaffRoleAccess = 'full' | 'front_desk' | 'stylist' | 'minimal';

export function getRoleAccess(role: string): StaffRoleAccess {
  switch (role) {
    case 'owner':
    case 'manager':
      return 'full';
    case 'receptionist':
      return 'front_desk';
    case 'senior_stylist':
    case 'junior_stylist':
      return 'stylist';
    case 'helper':
    default:
      return 'minimal';
  }
}
