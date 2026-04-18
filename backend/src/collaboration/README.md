# Collaboration Module Documentation

## Overview

The collaboration module enables artists to invite other artists to collaborate on tracks, with transparent revenue split management and proper notification workflows.

## Key Features

- **Invitation System**: Track owners can invite artists to collaborate
- **Revenue Split Management**: Configurable percentage splits with validation
- **Approval Workflow**: Collaborators can approve or reject invitations
- **Identity Management**: Proper separation between User IDs and Artist IDs
- **Transactional Safety**: All operations are wrapped in database transactions
- **Real-time Notifications**: WebSocket-based notifications for all collaboration events

## Identity Mapping

### Critical Distinction: User vs Artist IDs

The module properly handles the distinction between:

- **User ID**: The actual user account that receives notifications and has permissions
- **Artist ID**: The artistic entity that can be invited to collaborations

**Key Rules:**
- All permission checks use `userId` (from the authenticated request)
- All notifications target `userId` (not `artistId`)
- Artist entities are linked to users via the `artist.userId` field

### Notification Recipients

| Action | Recipient | ID Type | Reason |
|--------|-----------|---------|---------|
| Send Invitation | Invited Artist | `userId` | User receives notification |
| Approve/Reject | Track Owner | `userId` | Track owner gets response |
| Remove Collaborator | No notification | N/A | Only track owner can remove |

## API Endpoints

### POST `/collaborations/tracks/:trackId/invite`
Invite artists to collaborate on a track.

**Permissions:** Track owner only

**Request Body:**
```json
{
  "trackId": "uuid",
  "collaborators": [
    {
      "artistId": "uuid",
      "role": "featured|producer|composer|mixer",
      "splitPercentage": 10.5,
      "invitationMessage": "Optional message"
    }
  ]
}
```

**Response:**
```json
[
  {
    "id": "collab-uuid",
    "trackId": "track-uuid",
    "artistId": "artist-uuid",
    "role": "featured",
    "splitPercentage": 10.5,
    "approvalStatus": "pending",
    "createdAt": "2024-01-01T00:00:00Z"
  }
]
```

### PATCH `/collaborations/:collaborationId/approval`
Respond to a collaboration invitation.

**Permissions:** Invited artist only

**Request Body:**
```json
{
  "status": "approved|rejected",
  "rejectionReason": "Required if status is rejected"
}
```

### GET `/collaborations/tracks/:trackId`
Get all collaborations for a track.

**Permissions:** Public (read-only)

### GET `/collaborations/invitations/pending`
Get pending invitations for the current user.

**Permissions:** Authenticated user only

### DELETE `/collaborations/:collaborationId`
Remove a collaborator from a track.

**Permissions:** Track owner only

### GET `/collaborations/tracks/:trackId/stats`
Get collaboration statistics for a track.

**Permissions:** Public (read-only)

## Validation Rules

### Split Percentage Validation

1. **Individual Bounds**: Each split must be between 0.01% and 100%
2. **Total Cap**: Sum of all approved collaborations must not exceed 100%
3. **Primary Artist Minimum**: Primary artist must retain at least 0.01%
4. **Decimal Precision**: Supports up to 2 decimal places

### Duplicate Prevention

- **No Self-Invitation**: Artists cannot invite themselves
- **No Duplicate Invites**: Cannot invite the same artist twice (including pending)
- **Status Tracking**: Each collaboration can only be responded to once

### Rejection Validation

- **Required Reason**: Rejection reason is mandatory when declining
- **Response Limits**: Cannot respond to already processed invitations

## Transactional Safety

All write operations are wrapped in database transactions:

### Invitation Flow
```typescript
// Transaction starts
1. Validate track ownership
2. Validate split percentages
3. Check for duplicates
4. Create collaboration records
5. Send notifications
6. Commit transaction
// If any step fails: rollback transaction
```

### Response Flow
```typescript
// Transaction starts
1. Validate collaboration exists
2. Validate user permissions
3. Update collaboration status
4. Send notification to track owner
5. Emit events
6. Commit transaction
// If any step fails: rollback transaction
```

## Error Handling

### Permission Errors
- `403 Forbidden`: User not authorized for the action
- Track ownership validation
- Invitation response permissions
- Collaborator removal permissions

### Validation Errors
- `400 Bad Request`: Invalid input data
- Split percentage violations
- Duplicate invitations
- Missing rejection reasons

### Not Found Errors
- `404 Not Found`: Resource doesn't exist
- Track not found
- Artist not found
- Collaboration not found

## Event Emission

The module emits events for real-time updates:

### Collaboration Events
```typescript
// Invitation sent
'collaboration.invited': {
  trackId: string;
  collaborations: Collaboration[];
}

// Invitation responded
'collaboration.responded': {
  collaboration: Collaboration;
  status: ApprovalStatus;
}

// Collaborator removed
'collaboration.removed': {
  collaborationId: string;
  trackId: string;
  removedBy: string;
}

// Approved collaborator removed (special case)
'collaboration.approved_removed': {
  collaboration: Collaboration;
  removedBy: string;
}
```

## Database Schema

### Collaborations Table
```sql
CREATE TABLE collaborations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  artist_id UUID NOT NULL REFERENCES artists(id),
  role VARCHAR(20) NOT NULL DEFAULT 'featured',
  split_percentage DECIMAL(5,2) NOT NULL,
  approval_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  invitation_message TEXT,
  rejection_reason TEXT,
  responded_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(track_id, artist_id)
);
```

### Indexes
- Primary key: `id`
- Unique constraint: `(track_id, artist_id)`
- Foreign keys: `track_id`, `artist_id`

## Security Considerations

### Identity Verification
- All operations validate the requesting user's identity
- Artist-to-user mapping is verified before permissions checks
- Notifications are sent to verified user accounts only

### Data Integrity
- Transactional operations prevent partial state corruption
- Unique constraints prevent duplicate collaborations
- Validation rules ensure data consistency

### Access Control
- JWT authentication required for all operations
- Role-based permissions enforced at service level
- Track ownership validated before modifications

## Testing Strategy

### Unit Tests Coverage
- ✅ Permission validation
- ✅ Split percentage validation
- ✅ Duplicate prevention
- ✅ Transactional safety
- ✅ Notification targeting
- ✅ Error handling

### Integration Tests
- End-to-end collaboration workflows
- Database transaction rollback scenarios
- WebSocket event emission
- Notification delivery

### Test Categories
1. **Identity Tests**: Verify user vs artist ID handling
2. **Permission Tests**: Validate access control
3. **Validation Tests**: Test input validation rules
4. **Transaction Tests**: Ensure rollback scenarios
5. **Notification Tests**: Verify correct recipients

## Performance Considerations

### Database Optimization
- Indexed queries for track collaborations
- Efficient join operations with artist/track data
- Minimal transaction scopes

### Notification Efficiency
- Async notification sending
- Batch operations for multiple invitations
- Event-driven updates

### Caching Strategy
- Track collaboration statistics can be cached
- Artist collaboration history benefits from caching
- Permission checks should leverage user session data

## Monitoring and Logging

### Key Metrics
- Invitation success/failure rates
- Response times for collaboration operations
- Transaction rollback frequency
- Notification delivery success rates

### Audit Events
- All collaboration state changes
- Permission violations
- Split percentage modifications
- User actions on collaborations

## Migration Notes

### From Legacy System
If migrating from a previous collaboration system:

1. **Identity Mapping**: Ensure proper user-artist relationships
2. **Data Validation**: Validate existing split percentages
3. **Notification Migration**: Update notification targets to use `userId`
4. **Permission Updates**: Implement new permission checks

### Breaking Changes
- Notification recipients now use `userId` instead of `artistId`
- Stricter validation on split percentages
- Required rejection reasons for declined invitations
- Enhanced permission checks

## Future Enhancements

### Planned Features
- [ ] Collaboration templates
- [ ] Bulk invitation management
- [ ] Collaboration history tracking
- [ ] Advanced split algorithms
- [ ] Collaboration agreements

### Scalability Improvements
- [ ] Distributed collaboration processing
- [ ] Event sourcing for collaboration changes
- [ ] Real-time collaboration status updates
- [ ] Advanced analytics dashboard
