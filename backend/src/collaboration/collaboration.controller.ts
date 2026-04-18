import {
  Controller,
  Post,
  Patch,
  Get,
  Param,
  Body,
  Req,
  UseGuards,
  Delete,
} from "@nestjs/common";
import { CollaborationService } from "./collaboration.service";
import { InviteCollaboratorDto } from "./dto/invite-collaborator.dto";
import { UpdateApprovalDto } from "./dto/update-approval.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";

@Controller("collaborations")
@UseGuards(JwtAuthGuard)
export class CollaborationController {
  constructor(private readonly collaborationService: CollaborationService) {}

  /**
   * Invite an artist to collaborate on a track
   * Only primary artist can do this
   */
  @Post("tracks/:trackId/invite")
  inviteCollaborator(
    @Param("trackId") trackId: string,
    @Body() dto: InviteCollaboratorDto,
    @Req() req,
  ) {
    return this.collaborationService.inviteCollaborators(req.user.id, {
      trackId,
      collaborators: [dto],
    } as any);
  }

  /**
   * Approve or reject a collaboration invite
   */
  @Patch(":collaborationId/approval")
  updateApprovalStatus(
    @Param("collaborationId") collaborationId: string,
    @Body() dto: UpdateApprovalDto,
    @Req() req,
  ) {
    return this.collaborationService.updateCollaborationStatus(
      collaborationId,
      req.user.id,
      dto,
    );
  }

  /**
   * Get all collaborations for a track
   */
  @Get("tracks/:trackId")
  getTrackCollaborations(@Param("trackId") trackId: string) {
    return this.collaborationService.getTrackCollaborators(trackId);
  }

  /**
   * Get pending invitations for current user
   */
  @Get("invitations/pending")
  getPendingInvitations(@Req() req) {
    return this.collaborationService.getPendingInvitations(req.user.id);
  }

  /**
   * Remove a collaborator (only track owner)
   */
  @Delete(":collaborationId")
  removeCollaborator(
    @Param("collaborationId") collaborationId: string,
    @Req() req,
  ) {
    return this.collaborationService.removeCollaborator(req.user.id, collaborationId);
  }

  /**
   * Get collaboration statistics for a track
   */
  @Get("tracks/:trackId/stats")
  getCollaborationStats(@Param("trackId") trackId: string) {
    return this.collaborationService.getCollaborationStats(trackId);
  }
}
