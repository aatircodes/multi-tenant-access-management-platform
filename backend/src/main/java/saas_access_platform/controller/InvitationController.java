package saas_access_platform.controller;

import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import saas_access_platform.dto.request.InviteUserRequest;
import saas_access_platform.dto.response.InvitationResponse;
import saas_access_platform.service.InvitationService;

@RestController
@RequestMapping("/api/invitations")
@RequiredArgsConstructor
public class InvitationController {

    private final InvitationService invitationService;

    @PostMapping
    @PreAuthorize("hasPermission(null, 'USER_INVITE')")
    public ResponseEntity<InvitationResponse> sendInvitation(
            @RequestBody InviteUserRequest request) {

        InvitationResponse response = invitationService.sendInvitation(request);
        return ResponseEntity.status(201).body(response);
    }
}