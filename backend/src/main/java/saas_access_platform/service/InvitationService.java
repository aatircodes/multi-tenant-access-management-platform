package saas_access_platform.service;

import lombok.RequiredArgsConstructor;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import saas_access_platform.dto.request.InviteUserRequest;
import saas_access_platform.dto.response.InvitationResponse;
import saas_access_platform.entity.Invitation;
import saas_access_platform.repository.InvitationRepository;
import saas_access_platform.repository.UserRepository;
import saas_access_platform.security.CurrentUserContext;

import java.time.LocalDateTime;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class InvitationService {

    private final InvitationRepository invitationRepository;
    private final UserRepository userRepository;

    public InvitationResponse sendInvitation(InviteUserRequest request) {

        CurrentUserContext currentUser = (CurrentUserContext) SecurityContextHolder
                .getContext()
                .getAuthentication()
                .getPrincipal();

        if (userRepository.existsByEmailAndOrgId(request.getEmail(), currentUser.getOrgId())) {
            throw new IllegalArgumentException("User already exists in this organization");
        }

        if (invitationRepository.existsByEmailAndOrgIdAndStatus(
                request.getEmail(), currentUser.getOrgId(), Invitation.InvitationStatus.PENDING)) {
            throw new IllegalArgumentException("Pending invitation already exists for this email");
        }

        String token = UUID.randomUUID().toString();

        Invitation invitation = new Invitation();
        invitation.setOrgId(currentUser.getOrgId());
        invitation.setEmail(request.getEmail());
        invitation.setRoleId(request.getRoleId());
        invitation.setToken(token);
        invitation.setStatus(Invitation.InvitationStatus.PENDING);

        invitationRepository.save(invitation);

        return new InvitationResponse(token, request.getEmail(),
                LocalDateTime.now().plusHours(48));
    }
}