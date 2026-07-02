package saas_access_platform.service;

import lombok.RequiredArgsConstructor;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import saas_access_platform.dto.request.InviteUserRequest;
import saas_access_platform.dto.response.InvitationResponse;
import saas_access_platform.dto.response.PendingInvitationResponse;
import saas_access_platform.entity.Invitation;
import saas_access_platform.entity.Role;
import saas_access_platform.exception.ResourceNotFoundException;
import saas_access_platform.repository.InvitationRepository;
import saas_access_platform.repository.RoleRepository;
import saas_access_platform.repository.UserRepository;
import saas_access_platform.security.CurrentUserContext;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class InvitationService {

    private final InvitationRepository invitationRepository;
    private final UserRepository userRepository;
    private final RoleRepository roleRepository;

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

    public List<PendingInvitationResponse> getPendingInvitations() {
        CurrentUserContext currentUser = (CurrentUserContext) SecurityContextHolder
                .getContext()
                .getAuthentication()
                .getPrincipal();

        return invitationRepository.findAllByOrgId(currentUser.getOrgId())
                .stream()
                .filter(inv -> inv.getStatus() == Invitation.InvitationStatus.PENDING)
                .map(inv -> PendingInvitationResponse.builder()
                        .id(inv.getId())
                        .email(inv.getEmail())
                        .roleName(roleRepository.findById(inv.getRoleId())
                                .map(Role::getName)
                                .orElse("Unknown"))
                        .status(inv.getStatus().name())
                        .expiresAt(inv.getExpiresAt())
                        .build())
                .toList();
    }

    public void revokeInvitation(Long invitationId) {
        CurrentUserContext currentUser = (CurrentUserContext) SecurityContextHolder
                .getContext()
                .getAuthentication()
                .getPrincipal();

        Invitation invitation = invitationRepository
                .findByIdAndOrgId(invitationId, currentUser.getOrgId())
                .orElseThrow(() -> new ResourceNotFoundException("Invitation not found"));

        if (invitation.getStatus() != Invitation.InvitationStatus.PENDING) {
            throw new IllegalArgumentException("Only pending invitations can be revoked");
        }

        invitationRepository.delete(invitation);
    }
}