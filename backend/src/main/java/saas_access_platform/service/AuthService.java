package saas_access_platform.service;

import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import saas_access_platform.dto.request.LoginRequest;
import saas_access_platform.dto.request.RegisterOrgRequest;
import saas_access_platform.dto.response.LoginResponse;
import saas_access_platform.dto.response.RegisterOrgResponse;
import saas_access_platform.entity.Organization;
import saas_access_platform.entity.Permission;
import saas_access_platform.entity.Role;
import saas_access_platform.entity.User;
import saas_access_platform.entity.UserRole;
import saas_access_platform.repository.*;
import saas_access_platform.security.JwtUtil;
import saas_access_platform.dto.request.AcceptInvitationRequest;
import saas_access_platform.entity.Invitation;
import saas_access_platform.exception.InvalidInvitationException;
import saas_access_platform.entity.AuditLog;

import java.time.LocalDateTime;
import java.util.stream.Collectors;

import java.util.List;

@Service
@RequiredArgsConstructor
public class AuthService {

    private final OrganizationRepository organizationRepository;
    private final UserRepository userRepository;
    private final RoleRepository roleRepository;
    private final RolePermissionRepository rolePermissionRepository;
    private final UserRoleRepository userRoleRepository;
    private final PermissionRepository permissionRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtUtil jwtUtil;
    private final InvitationRepository invitationRepository;
    private final AuditLogRepository auditLogRepository;

    @Transactional
    public RegisterOrgResponse registerOrg(RegisterOrgRequest request) {

        if (organizationRepository.existsByName(request.getOrgName())) {
            throw new RuntimeException("Organization name already exists");
        }

        String slug = generateSlug(request.getOrgName());
        if (organizationRepository.existsBySlug(slug)) {
            throw new RuntimeException("Organization slug already exists");
        }

        Organization org = Organization.builder()
                .name(request.getOrgName())
                .slug(slug)
                .status(Organization.OrgStatus.ACTIVE)
                .requestLimitPerMinute(100)
                .build();
        org = organizationRepository.save(org);

        List<Permission> allPermissions = permissionRepository.findAll();
        Role adminRole = Role.builder()
                .orgId(org.getId())
                .name("Admin")
                .build();
        adminRole = roleRepository.save(adminRole);

        for (Permission permission : allPermissions) {
            rolePermissionRepository.save(
                    saas_access_platform.entity.RolePermission.builder()
                            .roleId(adminRole.getId())
                            .permissionId(permission.getId())
                            .build()
            );
        }

        User adminUser = User.builder()
                .orgId(org.getId())
                .email(request.getAdminEmail())
                .passwordHash(passwordEncoder.encode(request.getPassword()))
                .status(User.UserStatus.ACTIVE)
                .build();
        adminUser = userRepository.save(adminUser);

        UserRole userRole = UserRole.builder()
                .userId(adminUser.getId())
                .roleId(adminRole.getId())
                .build();
        userRoleRepository.save(userRole);

        return RegisterOrgResponse.builder()
                .message("Organisation registered successfully")
                .orgSlug(org.getSlug())
                .build();
    }

    public LoginResponse login(LoginRequest request) {

        Organization org = organizationRepository
                .findBySlug(request.getOrgSlug())
                .orElseThrow(() -> new RuntimeException("Invalid credentials"));

        User user = userRepository
                .findByEmailAndOrgId(request.getEmail(), org.getId())
                .orElseThrow(() -> new RuntimeException("Invalid credentials"));

        if (!passwordEncoder.matches(request.getPassword(),
                user.getPasswordHash())) {
            throw new RuntimeException("Invalid credentials");
        }

        List<String> roles = userRoleRepository
                .findAllByUserId(user.getId())
                .stream()
                .map(userRole -> roleRepository
                        .findById(userRole.getRoleId())
                        .map(Role::getName)
                        .orElse(""))
                .filter(name -> !name.isEmpty())
                .toList();

        String token = jwtUtil.generateToken(
                user.getId(),
                org.getId(),
                user.getEmail(),
                roles
        );

        return LoginResponse.builder()
                .token(token)
                .orgSlug(org.getSlug())
                .orgName(org.getName())
                .orgId(org.getId())
                .userId(user.getId())
                .email(user.getEmail())
                .build();
    }

    @Transactional
    public LoginResponse acceptInvitation(AcceptInvitationRequest request) {

        Invitation invitation = invitationRepository.findByToken(request.getToken())
                .orElseThrow(() -> new InvalidInvitationException("Invalid invitation token"));

        if (invitation.getStatus() != Invitation.InvitationStatus.PENDING) {
            throw new InvalidInvitationException("Invitation has already been used");
        }

        if (invitation.getExpiresAt().isBefore(LocalDateTime.now())) {
            throw new InvalidInvitationException("Invitation has expired");
        }

        User user = new User();
        user.setOrgId(invitation.getOrgId());
        user.setEmail(invitation.getEmail());
        user.setPasswordHash(passwordEncoder.encode(request.getPassword()));
        user.setStatus(User.UserStatus.ACTIVE);

        User savedUser = userRepository.save(user);

        UserRole userRole = new UserRole();
        userRole.setUserId(savedUser.getId());
        userRole.setRoleId(invitation.getRoleId());
        userRole.setAssignedAt(LocalDateTime.now());

        userRoleRepository.save(userRole);

        invitation.setStatus(Invitation.InvitationStatus.ACCEPTED);
        invitationRepository.save(invitation);

        AuditLog auditLog = AuditLog.builder()
                .orgId(savedUser.getOrgId())
                .actorUserId(savedUser.getId())
                .action("USER_JOINED")
                .entityType("USER")
                .entityId(savedUser.getId())
                .build();

        auditLogRepository.save(auditLog);

        Organization org = organizationRepository.findById(invitation.getOrgId())
                .orElseThrow(() -> new RuntimeException("Organization not found"));

        List<String> roles = userRoleRepository.findAllByUserId(savedUser.getId())
                .stream()
                .map(ur -> roleRepository.findById(ur.getRoleId())
                        .map(Role::getName)
                        .orElse(""))
                .filter(name -> !name.isEmpty())
                .collect(Collectors.toList());

        String token = jwtUtil.generateToken(
                savedUser.getId(),
                org.getId(),
                savedUser.getEmail(),
                roles
        );

        return LoginResponse.builder()
                .token(token)
                .orgSlug(org.getSlug())
                .orgName(org.getName())
                .orgId(org.getId())
                .userId(savedUser.getId())
                .email(savedUser.getEmail())
                .build();
    }

    private String generateSlug(String orgName) {
        return orgName.toLowerCase()
                .trim()
                .replaceAll("[^a-z0-9\\s-]", "")
                .replaceAll("\\s+", "-");
    }
}