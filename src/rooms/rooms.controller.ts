import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RoomsService } from './rooms.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { FindRoomsDto } from './dto/find-rooms.dto';
import { RoomResponseDto } from './dto/room-response.dto';

@Controller('rooms')
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  // Public on purpose: guests browse before they sign up.
  @Get()
  async findAvailable(@Query() query: FindRoomsDto) {
    const rooms = await this.roomsService.findAvailable(query);
    return rooms.map((r) => new RoomResponseDto(r));
  }

  // Must stay above @Get(':id') — Nest matches in declaration order, and a
  // ':id' declared first would capture "all" and try to load it as an id.
  @Get('all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async findAll() {
    const rooms = await this.roomsService.findAll();
    return rooms.map((r) => new RoomResponseDto(r));
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const room = await this.roomsService.findOne(id);
    return new RoomResponseDto(room);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async create(@Body() dto: CreateRoomDto) {
    const room = await this.roomsService.create(dto);
    return new RoomResponseDto(room);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async update(@Param('id') id: string, @Body() dto: UpdateRoomDto) {
    const room = await this.roomsService.update(id, dto);
    return new RoomResponseDto(room);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    await this.roomsService.remove(id);
  }
}
