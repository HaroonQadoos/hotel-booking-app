export class UserResponseDto {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: Date;

  constructor(user: any) {
    this.id = user._id;
    this.name = user.name;
    this.email = user.email;
    this.role = user.role;
    this.createdAt = user.createdAt;
  }
}
